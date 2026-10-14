"""Disposable local CL-013a runtime. Never changes the user's .env or shared Compose project."""

import argparse
import json
import os
import secrets
import signal
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path(
    os.environ.get("CANLEARN_SMOKE_RUNTIME_DIR", f"/tmp/canlearn-cl013-{os.getuid()}")
)
COMPONENTS = ("api", "worker", "dispatcher", "web")
COMMANDS = {
    "api": ["node", str(ROOT / "apps/api/dist/main.js")],
    "worker": [
        "uv",
        "run",
        "--project",
        str(ROOT / "apps/workflow"),
        "canlearn-worker",
    ],
    "dispatcher": [
        "uv",
        "run",
        "--project",
        str(ROOT / "apps/workflow"),
        "canlearn-smoke-dispatcher",
    ],
    "web": [
        "pnpm",
        "--filter",
        "@canlearn/web",
        "exec",
        "next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3310",
    ],
}


def environment() -> dict[str, str]:
    RUNTIME.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = RUNTIME / "runtime.json"
    if not path.exists():
        values = {
            "CANLEARN_SMOKE_ENABLED": "true",
            "CANLEARN_SMOKE_TOKEN": secrets.token_hex(32),
            "CANLEARN_SMOKE_ORIGIN": "http://127.0.0.1:3310",
            "CANLEARN_SMOKE_API_URL": "http://127.0.0.1:3311/v1",
            "API_INTERNAL_URL": "http://127.0.0.1:3311/v1",
            "API_PORT": "3311",
            "CORS_ORIGIN": "http://127.0.0.1:3310",
            "DATABASE_URL": "postgresql://canlearn:canlearn_local@127.0.0.1:15433/canlearn",
            "TEMPORAL_ADDRESS": "127.0.0.1:17234",
            "TEMPORAL_NAMESPACE": "default",
            "TEMPORAL_TASK_QUEUE": "canlearn-cl013-synthetic",
            "CANLEARN_DOCKERHUB_REGISTRY": "jjs7iczbx3i38wpthb.xuanyuan.run",
            "POSTGRES_DB": "canlearn",
            "POSTGRES_USER": "canlearn",
            "POSTGRES_PASSWORD": "canlearn_local",
            "TEMPORAL_POSTGRES_USER": "temporal",
            "TEMPORAL_POSTGRES_PASSWORD": "temporal_local",
        }
        with path.open("x") as stream:
            os.chmod(path, 0o600)
            json.dump(values, stream)
    return {**os.environ, **json.loads(path.read_text())}


def run(command: list[str], **kwargs: object) -> None:
    subprocess.run(command, cwd=ROOT, env=environment(), check=True, **kwargs)


def compose(*args: str) -> None:
    env = environment()
    for name in (
        "DOCKER_HOST",
        "DOCKER_CONTEXT",
        "DOCKER_TLS",
        "DOCKER_TLS_VERIFY",
        "DOCKER_CERT_PATH",
    ):
        env.pop(name, None)
    # An empty env file prevents Compose from reading the user's repository .env.
    empty = RUNTIME / "compose.env"
    empty.touch(mode=0o600, exist_ok=True)
    subprocess.run(
        [
            "docker",
            "--host=unix:///var/run/docker.sock",
            "compose",
            "--env-file",
            str(empty),
            "-p",
            "canlearn-cl013",
            "-f",
            "compose.yaml",
            "-f",
            "compose.smoke.yaml",
            *args,
        ],
        cwd=ROOT,
        env=env,
        check=True,
    )


def process_id(name: str) -> int | None:
    path = RUNTIME / f"{name}.pid"
    if not path.exists():
        return None
    pid = int(path.read_text())
    try:
        if ") Z " in Path(f"/proc/{pid}/stat").read_text():
            path.unlink(missing_ok=True)
            return None
        command = (
            Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\x00", b" ").decode()
        )
        cwd = Path(f"/proc/{pid}/cwd").resolve()
    except (OSError, ValueError):
        path.unlink(missing_ok=True)
        return None
    if cwd != ROOT or COMMANDS[name][0] not in command:
        raise RuntimeError("Refusing to manage a PID that is not this smoke process")
    return pid


def start(name: str) -> None:
    if process_id(name):
        return
    with (RUNTIME / f"{name}.log").open("ab") as log:
        process = subprocess.Popen(
            COMMANDS[name],
            cwd=ROOT,
            env=environment(),
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    (RUNTIME / f"{name}.pid").write_text(str(process.pid))


def stop(name: str, hard: bool = False) -> None:
    pid = process_id(name)
    if pid:
        os.killpg(pid, signal.SIGKILL if hard else signal.SIGTERM)
        for _ in range(50):
            if not Path(f"/proc/{pid}").exists():
                break
            # An exited orphan may remain a zombie in a container; it owns no running process.
            if ") Z " in Path(f"/proc/{pid}/stat").read_text():
                break
            time.sleep(0.1)
        else:
            os.killpg(pid, signal.SIGKILL)
    (RUNTIME / f"{name}.pid").unlink(missing_ok=True)


def ready(url: str, seconds: int = 40) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            with opener.open(url, timeout=2) as response:
                if response.status == 200:
                    return
        except OSError:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"Smoke service not ready: {url}; inspect logs in {RUNTIME}")


def up(skip_build: bool = False) -> None:
    environment()
    for name in reversed(COMPONENTS):
        stop(name)
    compose(
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "180",
        "postgres",
        "temporal",
        "temporal-ui",
    )
    if not skip_build:
        run(["pnpm", "build"])
    run(["pnpm", "--filter", "@canlearn/api", "db:migrate"])
    start("api")
    ready("http://127.0.0.1:3311/v1/health")
    for name in ("worker", "dispatcher", "web"):
        start(name)
    ready("http://127.0.0.1:3310/smoke")
    print("Smoke ready: http://127.0.0.1:3310/smoke", flush=True)


def down() -> None:
    for name in reversed(COMPONENTS):
        stop(name)
    compose("down")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action", choices=("up", "down", "restart", "status", "test", "clean")
    )
    parser.add_argument("component", nargs="?", choices=COMPONENTS)
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument(
        "--keep", action="store_true", help="Keep the disposable runtime after tests"
    )
    args = parser.parse_args()
    if args.action == "up":
        up(args.skip_build)
    elif args.action == "down":
        down()
    elif args.action == "clean":
        down()
        compose("down", "--volumes")
    elif args.action == "restart":
        for name in (args.component,) if args.component else COMPONENTS:
            stop(name)
            start(name)
    elif args.action == "status":
        for name in COMPONENTS:
            print(f"{name}: {'running' if process_id(name) else 'stopped'}")
        compose("ps", "--all")
    elif args.action == "test":
        try:
            up(args.skip_build)
            run(
                [
                    "uv",
                    "run",
                    "--project",
                    "apps/workflow",
                    "python",
                    "scripts/smoke_integration.py",
                ]
            )
        finally:
            if not args.keep:
                down()


if __name__ == "__main__":
    main()
