"""Observe an isolated stateless MinerU parse and optional competing query process.

Commands are JSON argv lists, never shell text. Only child process groups are stopped.
Use a new output directory, local models, all pages, and an explicitly selected tier.
This is a measurement supervisor, not the production MinerU Adapter or GPU scheduler.
"""

import argparse
import hashlib
import json
import os
import re
import signal
import subprocess
import time
from pathlib import Path


def gpu_sample() -> dict:
    result = subprocess.run(
        [
            "nvidia-smi",
            "--query-gpu=memory.used,memory.free,utilization.gpu",
            "--format=csv,noheader,nounits",
        ],
        capture_output=True,
        text=True,
        check=True,
        timeout=5,
    )
    used, free, util = map(int, result.stdout.splitlines()[0].split(","))
    return {"used_mib": used, "free_mib": free, "utilization_percent": util}


def coverage(directory: Path, pages: int) -> dict:
    # An anchor proves its text survived; a missing anchor alone does not prove a page was absent.
    hits = []
    files = []
    for path in sorted(directory.rglob("*.md")):
        if path.stat().st_size > 64 * 1024 * 1024:
            raise ValueError("Export too large for bounded coverage observation")
        text = path.read_text(errors="replace")
        hits += [
            int(v) for v in re.findall(r"PAGE[\s_-]*ANCHOR[\s_-]*(\d{3})(?!\d)", text)
        ]
        files.append(
            {
                "file": str(path.relative_to(directory)),
                "bytes": path.stat().st_size,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )
    expected = set(range(1, pages + 1))
    observed = set(hits)
    return {
        "expected_pages": pages,
        "observed_anchor_count": len(observed & expected),
        "missing_anchors": sorted(expected - observed),
        "unexpected_anchors": sorted(observed - expected),
        "duplicate_anchors": sorted(v for v in observed if hits.count(v) > 1),
        "exports": files,
        "full_text_quality_verified": False,
        "note": "Anchor survival only; independently reconcile V1 result page manifest in CL-010",
    }


def stop(child: subprocess.Popen) -> None:
    if child.poll() is not None:
        return
    os.killpg(child.pid, signal.SIGTERM)
    try:
        child.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait(timeout=10)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--spec",
        type=Path,
        required=True,
        help="Private local JSON: parse_argv, optional query_argv, output_dir, version_argv, expected_version",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    parser.add_argument("--min-free-mib", type=int, default=768)
    parser.add_argument("--pages", type=int, default=300)
    parser.add_argument("--query-after-seconds", type=float, default=10)
    parser.add_argument(
        "--query-mode", choices=["concurrent", "serial"], default="concurrent"
    )
    args = parser.parse_args()
    if not 1 <= args.timeout_seconds <= 3600 or args.min_free_mib < 512:
        parser.error(
            "Use a 1–3600 second deadline and at least 512 MiB free-memory guard"
        )
    spec = json.loads(args.spec.read_text())
    for key in ("parse_argv", "version_argv"):
        if not isinstance(spec.get(key), list) or not all(
            isinstance(v, str) for v in spec[key]
        ):
            parser.error(f"{key} must be a JSON argv list")
    query_argv = spec.get("query_argv")
    if query_argv is not None and (
        not isinstance(query_argv, list)
        or not all(isinstance(v, str) for v in query_argv)
    ):
        parser.error("query_argv must be a JSON argv list")
    command = spec["parse_argv"]
    if any(v in command for v in ("--remote", "--remote-url", "--api-key")):
        parser.error("This observer permits local parsing only")
    if "--pages" not in command or command[command.index("--pages") + 1] != "all":
        parser.error("All-page observation requires explicit --pages all")
    if "--tier" not in command or "parse" not in command:
        parser.error("Use stateless mineru-kit parse and an explicit tier")
    if Path(command[0]).name != "mineru-kit":
        parser.error(
            "Only stateless mineru-kit is supported; managed server cancellation needs V1 Adapter"
        )
    version = subprocess.run(
        spec["version_argv"], capture_output=True, text=True, check=True, timeout=15
    ).stdout.strip()
    if version != spec["expected_version"]:
        parser.error("Installed MinerU version differs from pinned version")
    directory = Path(spec["output_dir"])
    if directory.exists():
        parser.error("Use a fresh output_dir to avoid cached or stale export coverage")
    directory.mkdir(parents=True)
    baseline = gpu_sample()
    if baseline["free_mib"] < 4096:
        parser.error(
            "Less than 4 GiB free before parse; defer instead of evicting existing workloads"
        )
    started = time.perf_counter()
    result = {
        "version": version,
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "gpu_baseline": baseline,
        "samples": [],
        "stop_reason": None,
        "query_started": False,
        "query_mode": args.query_mode,
    }
    children = []
    # Raw subprocess logs stay outside the repo; no command/config/credential echo in results.
    with (
        (directory / "parse.local.log").open("w") as parse_log,
        (directory / "query.local.log").open("w") as query_log,
    ):
        try:
            parse = subprocess.Popen(
                command,
                stdout=parse_log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            children.append(parse)
            query = None
            while parse.poll() is None:
                elapsed = time.perf_counter() - started
                sample = gpu_sample()
                result["samples"].append(
                    {"elapsed_seconds": round(elapsed, 2), **sample}
                )
                if (
                    elapsed >= args.timeout_seconds
                    or sample["free_mib"] < args.min_free_mib
                ):
                    result["stop_reason"] = (
                        "deadline"
                        if elapsed >= args.timeout_seconds
                        else "free_memory_guard"
                    )
                    break
                if (
                    query_argv
                    and elapsed >= args.query_after_seconds
                    and "query_arrival_seconds" not in result
                ):
                    result["query_arrival_seconds"] = round(elapsed, 3)
                if (
                    query_argv
                    and query is None
                    and elapsed >= args.query_after_seconds
                    and args.query_mode == "concurrent"
                ):
                    query = subprocess.Popen(
                        query_argv,
                        stdout=query_log,
                        stderr=subprocess.STDOUT,
                        start_new_session=True,
                    )
                    children.append(query)
                    result["query_started"] = True
                    result["query_started_seconds"] = round(elapsed, 2)
                    result["observed_query_queue_wait_seconds"] = round(
                        elapsed - result["query_arrival_seconds"], 3
                    )
                time.sleep(0.5)
            result["parse_seconds"] = round(time.perf_counter() - started, 3)
            if (
                query_argv
                and args.query_mode == "serial"
                and parse.poll() is not None
                and result["stop_reason"] is None
            ):
                result.setdefault("query_arrival_seconds", result["parse_seconds"])
                query = subprocess.Popen(
                    query_argv,
                    stdout=query_log,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                )
                children.append(query)
                result["query_started"] = True
                result["query_started_seconds"] = round(
                    time.perf_counter() - started, 3
                )
                result["observed_query_queue_wait_seconds"] = round(
                    result["query_started_seconds"] - result["query_arrival_seconds"], 3
                )
            if query is not None and parse.poll() is not None and query.poll() is None:
                try:
                    query.wait(
                        timeout=min(
                            60, max(1, args.timeout_seconds - result["parse_seconds"])
                        )
                    )
                except subprocess.TimeoutExpired:
                    result["query_stop_reason"] = "query_deadline"
        finally:
            for child in reversed(children):
                stop(child)
    result["parse_exit_code"] = children[0].returncode
    result["query_exit_code"] = children[1].returncode if len(children) > 1 else None
    result["coverage"] = coverage(directory, args.pages)
    result["gpu_after_children_exit"] = gpu_sample()
    result["serial_query_wait_bound_seconds"] = result["parse_seconds"]
    result["note"] = (
        "Queue wait is an isolated supervisor observation, not a deployed API/Temporal queue. Full request latency also includes model load and inference. GPU peak is a 0.5s sampled lower bound."
    )
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        f"Saved {args.output.name}; parse exit {result['parse_exit_code']}, anchors {result['coverage']['observed_anchor_count']}/{args.pages}"
    )


if __name__ == "__main__":
    main()
