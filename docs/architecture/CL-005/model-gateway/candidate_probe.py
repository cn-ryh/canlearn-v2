# /// script
# requires-python = ">=3.12"
# dependencies = ["openai==2.54.0", "httpx==0.28.1"]
# ///
"""Reuse the frozen parameter fixture/SDK evaluator for additional model aliases."""

import argparse
import hashlib
import json
import os
import random
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import openai
from openai import OpenAI
from parameter_probe import PROMPT, run_case
from responses_probe import ProtocolError


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--rates", type=Path, default=Path(__file__).with_name("quoted-rates.json")
    )
    args = parser.parse_args()
    base = os.environ.get("CL005_MODEL_BASE_URL", "").rstrip("/")
    key = os.environ.get("CL005_MODEL_API_KEY")
    models = os.environ.get("CL005_MODEL_ALIASES", "").split(",")
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
        parser.error(
            "Configure HTTPS CL005_MODEL_BASE_URL and runtime CL005_MODEL_API_KEY"
        )
    if len(models) != len(set(models)) or not 1 <= len(models) <= 3 or not all(models):
        parser.error("Use 1–3 distinct exact model aliases")
    decisions = json.loads(
        Path(__file__).with_name("selection-record.json").read_text()
    )
    if any(
        decisions["models"].get(model, {}).get("status") == "FAILED" for model in models
    ):
        parser.error(
            "FAILED model aliases are excluded; historical GLM evidence remains in prior results"
        )
    rates = json.loads(args.rates.read_text())
    cases = [
        {
            "model": model,
            "temperature": temp,
            "effort": effort,
            "repeat": repeat,
            "stream": True,
        }
        for model in models
        for temp in (0.0, 0.7, 1.0)
        for effort in ("low", "medium", "high")
        for repeat in (1, 2)
    ]
    random.Random(5005).shuffle(cases)
    cases += [
        {
            "model": model,
            "temperature": 0.0,
            "effort": effort,
            "repeat": 1,
            "stream": False,
        }
        for model in models
        for effort in ("low", "high")
    ]
    started = datetime.now(ZoneInfo("Asia/Shanghai"))
    report = {
        "date": started.date().isoformat(),
        "started_at": started.isoformat(),
        "scope": "Additional aliases; same frozen synthetic fixture, SDK, 16K output cap and streaming criteria; two nonstream probes per model",
        "openai": openai.__version__,
        "seed": 5005,
        "max_requests": len(cases),
        "scripts": {
            name: hashlib.sha256(
                Path(__file__).with_name(name).read_bytes()
            ).hexdigest()
            for name in (
                "candidate_probe.py",
                "parameter_probe.py",
                "responses_probe.py",
            )
        },
        "prompt_sha256": hashlib.sha256(PROMPT.encode()).hexdigest(),
        "output_cap": 16384,
        "max_retries": 0,
        "timeout_seconds": 60,
        "stream_deadline_seconds": 120,
        "runs": [],
        "complete": False,
        "real_data_enabled": False,
        "upstream_parameter_application_verified": False,
    }
    with OpenAI(base_url=base, api_key=key, max_retries=0, timeout=60.0) as client:
        for i, case in enumerate(cases, 1):
            try:
                row = run_case(client, case, rates.get(case["model"]))
            except ProtocolError as exc:
                row = {
                    **case,
                    "max_output_tokens": 16384,
                    "automatic_retries": 0,
                    "candidate_available": False,
                    "category": str(exc),
                    "usage": None,
                    "estimated_cost": None,
                    "real_data_enabled": False,
                }
            report["runs"].append(row)
            args.output.write_text(
                json.dumps(report, ensure_ascii=False, indent=2) + "\n"
            )
            print(
                f"{i}/{len(cases)} {case['model']} t={case['temperature']} effort={case['effort']} stream={case['stream']} {row['category']} {row.get('elapsed_seconds')}s",
                flush=True,
            )
    report["complete"] = True
    report["finished_at"] = datetime.now(ZoneInfo("Asia/Shanghai")).isoformat()
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
