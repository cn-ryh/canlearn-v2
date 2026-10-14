"""Blocking secret/dependency checks and explicit report-only image evaluation; no raw secret logs."""

import argparse
import json
import os
import shutil
import subprocess
import tempfile
from datetime import UTC, date, datetime
from pathlib import Path

from security_tools import ROOT, tool


def execute(command: list[str], expected: int = 0) -> None:
    env = dict(os.environ)
    for name in (
        "DOCKER_HOST",
        "DOCKER_CONTEXT",
        "DOCKER_TLS",
        "DOCKER_TLS_VERIFY",
        "DOCKER_CERT_PATH",
    ):
        env.pop(name, None)
    env["DOCKER_HOST"] = "unix:///var/run/docker.sock"
    env["TRIVY_DB_REPOSITORY"] = (
        "mirror.gcr.io/aquasec/trivy-db:2,jjs7iczbx3i38wpthb-ghcr.xuanyuan.run/aquasecurity/trivy-db:2"
    )
    result = subprocess.run(
        command,
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=300,
    )
    if result.returncode != expected:
        # Discard scanner diagnostics: failures must not print potential secret content.
        raise RuntimeError(
            f"Security command failed (exit={result.returncode}, expected={expected}); scan did not pass"
        )


def vulnerabilities(report: dict) -> list[dict]:
    return [
        {
            "target": result["Target"],
            "id": item["VulnerabilityID"],
            "package": item["PkgName"],
            "version": item["InstalledVersion"],
            "severity": item["Severity"],
            "fixed_version": item.get("FixedVersion", ""),
        }
        for result in report.get("Results", [])
        for item in result.get("Vulnerabilities", [])
    ]


def blockers(findings: list[dict], exceptions: list[dict]) -> list[dict]:
    today = datetime.now(UTC).date()
    for exception in exceptions:
        if (
            not exception.get("reason")
            or not exception.get("approved_by")
            or not exception.get("evidence", "").startswith("https://github.com/")
            or date.fromisoformat(exception["expires"]) < today
        ):
            raise ValueError("Security exception is incomplete or expired")
    return [
        finding
        for finding in findings
        if finding["severity"] in ("HIGH", "CRITICAL")
        and not any(
            all(
                exception.get(key) == finding[key]
                for key in ("target", "id", "package", "version")
            )
            for exception in exceptions
        )
    ]


def images_enforced(policy: dict, today: date | None = None) -> bool:
    if policy.get("mode") not in ("report-only", "enforce") or not policy.get(
        "owner_roles"
    ):
        raise ValueError("Invalid image vulnerability policy")
    deadline = date.fromisoformat(policy["triage_due"])
    return policy["mode"] == "enforce" or (today or datetime.now(UTC).date()) > deadline


def scan(output: Path, images: bool) -> None:
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(output, 0o700)
    gitleaks, trivy = tool("gitleaks"), tool("trivy")
    exceptions = json.loads((ROOT / "security/exceptions.json").read_text())
    execute(
        [
            gitleaks,
            "git",
            "--redact=100",
            "--no-banner",
            "--log-level",
            "error",
            "--report-format",
            "json",
            "--report-path",
            str(output / "history-secrets.json"),
            str(ROOT),
        ]
    )
    with tempfile.TemporaryDirectory(prefix="canlearn-security-") as temporary:
        snapshot = Path(temporary)
        paths = (
            subprocess.check_output(
                ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
                cwd=ROOT,
            )
            .decode()
            .split("\0")
        )
        for name in filter(None, paths):
            source = ROOT / name
            if source.is_symlink():
                raise ValueError(
                    "Refusing to export a symlink into the security snapshot"
                )
            if source.is_file():
                destination = snapshot / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
        execute(
            [
                gitleaks,
                "dir",
                "--redact=100",
                "--no-banner",
                "--log-level",
                "error",
                "--report-format",
                "json",
                "--report-path",
                str(output / "worktree-secrets.json"),
                str(snapshot),
            ]
        )
        execute(
            [
                trivy,
                "fs",
                "--quiet",
                "--scanners",
                "vuln",
                "--include-dev-deps",
                "--format",
                "json",
                "--output",
                str(output / "dependencies.json"),
                str(snapshot),
            ]
        )
    dependency_report = json.loads((output / "dependencies.json").read_text())
    coverage = {
        result["Type"]: len(result.get("Packages", []))
        for result in dependency_report.get("Results", [])
    }
    if not coverage.get("pnpm") or not coverage.get("uv"):
        raise RuntimeError("Dependency scanner omitted pnpm or uv package coverage")
    findings = vulnerabilities(dependency_report)
    blocked = blockers(findings, exceptions)
    summary = {
        "recorded_at": datetime.now(UTC).isoformat(),
        "secret_history_and_worktree": "passed",
        "dependency_packages": coverage,
        "dependency_findings": findings,
        "dependency_blockers": blocked,
        "tools": json.loads((ROOT / "security/tools.json").read_text()),
        "scanner_database": json.loads(
            subprocess.check_output([trivy, "--version", "--format", "json"], text=True)
        ),
        "image_mode": "not_requested",
        "images": [],
    }
    if images:
        with tempfile.NamedTemporaryFile() as empty:
            env = dict(os.environ)
            for name in (
                "DOCKER_HOST",
                "DOCKER_CONTEXT",
                "DOCKER_TLS",
                "DOCKER_TLS_VERIFY",
                "DOCKER_CERT_PATH",
            ):
                env.pop(name, None)
            configured = subprocess.check_output(
                [
                    "docker",
                    "--host=unix:///var/run/docker.sock",
                    "compose",
                    "--env-file",
                    empty.name,
                    "config",
                    "--format",
                    "json",
                ],
                cwd=ROOT,
                env=env,
            )
        services = json.loads(configured)["services"]
        policy = json.loads((ROOT / "security/image-policy.json").read_text())
        summary["image_mode"] = "enforce" if images_enforced(policy) else "report-only"
        summary["image_policy"] = policy
        for name, service in services.items():
            image = service["image"]
            path = output / f"image-{name}.json"
            execute(
                [
                    trivy,
                    "image",
                    "--quiet",
                    "--scanners",
                    "vuln",
                    "--format",
                    "json",
                    "--output",
                    str(path),
                    image,
                ]
            )
            report = json.loads(path.read_text())
            if not report.get("Results"):
                raise RuntimeError(f"Image scan produced no package results: {name}")
            summary["images"].append(
                {"service": name, "image": image, "findings": vulnerabilities(report)}
            )
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(
        f"Secrets passed; pnpm/uv packages {coverage}; dependency HIGH/CRITICAL blockers: {len(blocked)}; images: {summary['image_mode']}",
        flush=True,
    )
    if blocked:
        raise RuntimeError(
            "Known HIGH/CRITICAL dependency vulnerability blocks CI; see summary.json"
        )
    if (
        images
        and images_enforced(policy)
        and any(blockers(image["findings"], []) for image in summary["images"])
    ):
        raise RuntimeError(
            "Image vulnerability triage deadline expired with unresolved HIGH/CRITICAL findings"
        )


def probes(output: Path) -> None:
    gitleaks, trivy = tool("gitleaks"), tool("trivy")
    checks = []
    with tempfile.TemporaryDirectory(prefix="canlearn-security-probe-") as temporary:
        folder = Path(temporary)
        # Construct a nonexistent token at runtime. The token never reaches logs or Git.
        (folder / "controlled-secret.txt").write_text(
            "token = gh" + "p_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8" + "\n"
        )
        execute(
            [
                gitleaks,
                "dir",
                "--redact=100",
                "--no-banner",
                "--log-level",
                "error",
                str(folder),
            ],
            expected=1,
        )
        checks.append("constructed nonexistent secret rejected with redacted output")
        (folder / "controlled-secret.txt").unlink()
        (folder / "package-lock.json").write_text(
            json.dumps(
                {
                    "name": "controlled-vulnerable-fixture",
                    "version": "1.0.0",
                    "lockfileVersion": 3,
                    "packages": {
                        "": {"dependencies": {"lodash": "4.17.20"}},
                        "node_modules/lodash": {"version": "4.17.20"},
                    },
                }
            )
        )
        execute(
            [
                trivy,
                "fs",
                "--quiet",
                "--scanners",
                "vuln",
                "--severity",
                "HIGH,CRITICAL",
                "--exit-code",
                "1",
                "--format",
                "json",
                "--output",
                str(folder / "probe.json"),
                str(folder),
            ],
            expected=1,
        )
        assert blockers(
            vulnerabilities(json.loads((folder / "probe.json").read_text())), []
        )
        checks.append(
            "real advisory DB identifies controlled vulnerable dependency and blocks"
        )
    output.mkdir(parents=True, exist_ok=True)
    (output / "probe-results.json").write_text(
        json.dumps(
            {
                "recorded_at": datetime.now(UTC).isoformat(),
                "passed": len(checks),
                "checks": checks,
                "real_secrets_or_installed_vulnerable_packages": 0,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"{len(checks)} controlled security probes passed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("scan", "probes"))
    parser.add_argument("--images", action="store_true")
    parser.add_argument(
        "--output", type=Path, default=Path("/tmp/canlearn-security-results")
    )
    args = parser.parse_args()
    if args.action == "scan":
        scan(args.output.resolve(), args.images)
    else:
        probes(args.output.resolve())
