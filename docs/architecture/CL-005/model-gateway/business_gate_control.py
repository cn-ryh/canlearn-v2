# /// script
# requires-python = ">=3.12"
# dependencies = ["openai==2.54.0", "httpx==0.28.1"]
# ///
"""Two-request control aligning the extra local stem-length rule with the prompt."""

import argparse
import hashlib
import json
import os
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import business_chain_probe as probe
from openai import OpenAI


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--prior-results", type=Path, required=True)
    args = parser.parse_args()
    base, key = (
        os.environ.get("CL005_MODEL_BASE_URL", "").rstrip("/"),
        os.environ.get("CL005_MODEL_API_KEY"),
    )
    url = urlsplit(base)
    if (
        url.scheme != "https"
        or not url.hostname
        or url.username
        or url.password
        or url.query
        or url.fragment
        or not key
    ):
        parser.error("Configure HTTPS base and runtime key")
    prior = json.loads(args.prior_results.read_text())
    if not prior.get("complete"):
        parser.error("Finish the explicit-schema control first")
    here = Path(__file__).parent
    rates = json.loads((here / "quoted-rates.json").read_text())
    probe.MAX_REQUESTS = 2
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    report = {
        "date": now.date().isoformat(),
        "started_at": now.isoformat(),
        "scope": "Two-request local-rule alignment audit only; not a new broad matrix",
        "scripts": {
            name: hashlib.sha256((here / name).read_bytes()).hexdigest()
            for name in ("business_gate_control.py", "business_chain_probe.py")
        },
        "quoted_rates_sha256": hashlib.sha256(
            (here / "quoted-rates.json").read_bytes()
        ).hexdigest(),
        "prior_results_sha256": hashlib.sha256(
            args.prior_results.read_bytes()
        ).hexdigest(),
        "max_requests": 2,
        "quote_budget_scenario": str(probe.QUOTE_BUDGET),
        "real_data_enabled": False,
        "runs": [],
        "chains": [],
        "complete": False,
    }
    with OpenAI(base_url=base, api_key=key, timeout=60, max_retries=0) as client:
        runner = probe.Runner(client, rates, report, args.output)
        runner.reserved = probe.Decimal(prior["reserved_quote_upper_scenario"])
        prompt = (
            probe.generation_prompt("version_conflict")
            + "\n以下是全部结构约束：严格按requests顺序，id逐字使用Q01至Q06，题干stem长度10至600个字符，题干包含足够条件。answer必须整数，source_ids无重复且仅必要current来源，禁止额外字段。JSON Schema："
            + json.dumps(probe.GEN_SCHEMA, ensure_ascii=False)
        )
        value, row = runner.call(
            "step-5-preview", "generate", "version_conflict", prompt, probe.GEN_SCHEMA
        )
        local = probe.grade(value, "version_conflict")
        questions = value.get("questions") if isinstance(value, dict) else None
        lengths = (
            [
                len(q["stem"])
                if isinstance(q, dict) and isinstance(q.get("stem"), str)
                else None
                for q in questions
            ]
            if isinstance(questions, list)
            else None
        )
        checked, check_row = runner.call(
            "deepseek-v4.1-flash",
            "verify",
            "version_conflict",
            probe.checker_prompt("version_conflict", value)
            + "\n约束还包括stem长度10至600字符，id逐字Q01至Q06。严格结构："
            + json.dumps(probe.CHECK_SCHEMA, ensure_ascii=False),
            probe.CHECK_SCHEMA,
        )
        agrees = check_row["transport_valid"] and probe.check_agrees(checked, local)
        report["chains"].append(
            {
                "generator": "step-5-preview",
                "checker": "deepseek-v4.1-flash",
                "case": "version_conflict",
                "raw_generation": local,
                "stem_lengths": lengths,
                "fault_injected": False,
                "repair_attempts": 0,
                "initial_checker_agrees": agrees,
                "accepted": row["transport_valid"] and local["valid"] and agrees,
            }
        )
        report["complete"] = True
        report["finished_at"] = datetime.now(ZoneInfo("Asia/Shanghai")).isoformat()
        runner.save()


if __name__ == "__main__":
    main()
