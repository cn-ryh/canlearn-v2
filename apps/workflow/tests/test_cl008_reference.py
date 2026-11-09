"""Design regressions only; importing this fixture does not install a business Workflow."""

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3] / "docs/workflow/CL-008"
spec = importlib.util.spec_from_file_location("cl008_reference_model", ROOT / "job_model.py")
assert spec and spec.loader
model = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = model
spec.loader.exec_module(model)
cases = json.loads((ROOT / "scenarios.json").read_text())["cases"]


@pytest.mark.parametrize("case", cases, ids=[case["id"] for case in cases])
def test_reference_failure_and_recovery(case: dict) -> None:
    result = model.run_case(case)
    assert result["passed"] is True


def test_archived_examples_match_current_fixture_and_model() -> None:
    record = json.loads((ROOT / "example-results.json").read_text())
    for name, digest in record["source_sha256"].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest
    assert record["results"] == [model.run_case(case) for case in cases]
    assert record["passed"] == len(cases)
