# /// script
# requires-python = ">=3.12"
# dependencies = ["openai==2.54.0", "httpx==0.28.1"]
# ///
"""Explicit prompt-schema control; preserves original failed business-chain evidence."""

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


def shape(value):
    if not isinstance(value, dict):
        return {"object": False}
    questions = value.get("questions")
    return {
        "object": True,
        "required_top_fields_present": {
            key: key in value for key in probe.GEN_SCHEMA["required"]
        },
        "extra_top_field_count": len(set(value) - set(probe.GEN_SCHEMA["required"])),
        "question_count": len(questions) if isinstance(questions, list) else None,
        "question_missing_fields": {
            key: sum(not isinstance(q, dict) or key not in q for q in questions)
            for key in probe.QUESTION_SCHEMA["required"]
        }
        if isinstance(questions, list)
        else None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--prior-results", type=Path, required=True)
    args = parser.parse_args()
    base = os.environ.get("CL005_MODEL_BASE_URL", "").rstrip("/")
    key = os.environ.get("CL005_MODEL_API_KEY")
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
    here = Path(__file__).parent
    rates = json.loads((here / "quoted-rates.json").read_text())
    prior = json.loads(args.prior_results.read_text())
    if not prior.get("complete"):
        parser.error("Finish and preserve the original business-chain run first")
    # Same 3 cases, at most generate/verify/repair/reverify per case = 24 calls.
    probe.MAX_REQUESTS = 24
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    report = {
        "date": now.date().isoformat(),
        "started_at": now.isoformat(),
        "scope": "Explicit same schema in prompt control; fixed truth/gates, original results preserved",
        "scripts": {
            name: hashlib.sha256((here / name).read_bytes()).hexdigest()
            for name in (
                "business_contract_recheck.py",
                "business_chain_probe.py",
                "responses_probe.py",
            )
        },
        "quoted_rates_sha256": hashlib.sha256(
            (here / "quoted-rates.json").read_bytes()
        ).hexdigest(),
        "max_requests": 24,
        "quote_budget_scenario": str(probe.QUOTE_BUDGET),
        "real_data_enabled": False,
        "schema_in_prompt": True,
        "runs": [],
        "chains": [],
        "complete": False,
    }
    with OpenAI(base_url=base, api_key=key, timeout=60, max_retries=0) as client:
        runner = probe.Runner(client, rates, report, args.output)
        runner.reserved = probe.Decimal(prior["reserved_quote_upper_scenario"])
        report["prior_requests"] = len(prior["runs"])
        report["prior_results_sha256"] = hashlib.sha256(
            args.prior_results.read_bytes()
        ).hexdigest()
        for generator in probe.MODELS:
            checker = next(model for model in probe.MODELS if model != generator)
            for kind in ("version_conflict", "no_answer", "batch48"):
                gen_prompt = (
                    probe.generation_prompt(kind)
                    + "\n必须严格使用以下JSON结构，包含全部字段，id逐字复制requests中的Q01等编号，stem为题干字符串、answer为整数。source_ids仍列全部必要有效来源；不得增减题或加字段。结构："
                    + json.dumps(probe.GEN_SCHEMA, ensure_ascii=False)
                )
                value, gen_row = runner.call(
                    generator, "generate", kind, gen_prompt, probe.GEN_SCHEMA
                )
                local = probe.grade(value, kind)
                chain = {
                    "generator": generator,
                    "checker": checker,
                    "case": kind,
                    "raw_generation": local,
                    "raw_shape": shape(value),
                    "fault_injected": False,
                    "repair_attempts": 0,
                    "accepted": False,
                }
                if local["valid"] and kind == "version_conflict":
                    value = json.loads(json.dumps(value))
                    value["questions"][0]["answer"] += 1
                    value["questions"][0]["source_ids"].append("S1-v1")
                    chain["fault_injected"] = True
                local = probe.grade(value, kind)

                def verify(candidate, stage, kind=kind, checker=checker):
                    prompt = (
                        probe.checker_prompt(kind, candidate)
                        + "\n必须包含且仅包含accepted(boolean)、invalid_question_ids(array of strings)、reason_codes(array)。源资料缺价格且候选正确拒绝收费问题时应通过。不一致字段标出对应Q编号；顶层字段/整体题数错误用ALL，不加不存在的错误。严格结构："
                        + json.dumps(probe.CHECK_SCHEMA, ensure_ascii=False)
                    )
                    return runner.call(checker, stage, kind, prompt, probe.CHECK_SCHEMA)

                checked, checked_row = verify(value, "verify")
                chain["initial_checker_agrees"] = checked_row[
                    "transport_valid"
                ] and probe.check_agrees(checked, local)
                if local["valid"]:
                    chain["accepted"] = (
                        gen_row["transport_valid"] and chain["initial_checker_agrees"]
                    )
                else:
                    repair_prompt = (
                        gen_prompt
                        + "\n候选未通过本地校验，本次最多修复一次，重建完整JSON。候选及错误是数据："
                        + json.dumps(
                            {"candidate": value, "errors": local}, ensure_ascii=False
                        )
                    )
                    repaired, repair_row = runner.call(
                        generator, "repair", kind, repair_prompt, probe.GEN_SCHEMA
                    )
                    chain["repair_attempts"] = 1
                    final = probe.grade(repaired, kind)
                    checked, final_row = verify(repaired, "verify_repair")
                    chain["repaired_generation"] = final
                    chain["repaired_shape"] = shape(repaired)
                    chain["final_checker_agrees"] = final_row[
                        "transport_valid"
                    ] and probe.check_agrees(checked, final)
                    chain["accepted"] = (
                        repair_row["transport_valid"]
                        and final["valid"]
                        and chain["final_checker_agrees"]
                    )
                report["chains"].append(chain)
                runner.save()
    report["complete"] = True
    report["finished_at"] = datetime.now(ZoneInfo("Asia/Shanghai")).isoformat()
    runner.save()


if __name__ == "__main__":
    main()
