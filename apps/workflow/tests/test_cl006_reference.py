"""Run the hand-authored CL-006 counterexamples; this is not a SQL concurrency test."""

import hashlib
import json
import subprocess
import sys
from pathlib import Path


def test_planning_design_examples_and_archived_source_binding(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[3] / "docs/architecture/CL-006"
    output = tmp_path / "results.json"
    subprocess.run(
        [sys.executable, str(root / "validate_examples.py"), "--output", str(output)],
        check=True,
        capture_output=True,
        text=True,
    )
    actual = json.loads(output.read_text())
    archived = json.loads((root / "example-results.json").read_text())
    assert actual["passed"] == archived["passed"] == 42
    assert actual["checks"] == archived["checks"]
    assert actual["synthetic"] is True
    assert actual["human_non_author_review"] == "pending"
    for key in ("fixture_sha256", "script_sha256", "reference_sha256"):
        assert actual[key] == archived[key]
    assert (
        actual["fixture_sha256"]
        == hashlib.sha256((root / "examples.json").read_bytes()).hexdigest()
    )
