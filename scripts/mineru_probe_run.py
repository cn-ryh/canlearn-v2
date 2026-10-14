"""Run the real parser probe with a private key file and disposable CanLearn runtime."""

import argparse
import os
import subprocess
from pathlib import Path

from smoke_runtime import ROOT, down, environment, up


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--api-key-file", required=True, type=Path)
    parser.add_argument("--control-spec", required=True, type=Path)
    parser.add_argument("--record", required=True, type=Path)
    parser.add_argument("--artifact-dir", required=True, type=Path)
    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()
    os.environ.update(
        CANLEARN_SMOKE_ENABLED="true",
        CANLEARN_MINERU_PROBE_ENABLED="true",
        MINERU_BASE_URL=args.base_url,
        MINERU_API_KEY=args.api_key_file.read_text().strip(),
        CANLEARN_MINERU_PROBE_ARTIFACT_DIR=str(args.artifact_dir.resolve()),
    )
    if not os.environ["MINERU_API_KEY"]:
        raise ValueError("Private MinerU key file is empty")
    try:
        up(args.skip_build)
        subprocess.run(
            [
                "uv",
                "run",
                "--project",
                "apps/workflow",
                "python",
                "scripts/mineru_integration.py",
                "--control-spec",
                str(args.control_spec.resolve()),
                "--record",
                str(args.record.resolve()),
            ],
            cwd=ROOT,
            env=environment(),
            check=True,
        )
    finally:
        down()


if __name__ == "__main__":
    main()
