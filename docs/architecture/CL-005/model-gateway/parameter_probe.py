# /// script
# requires-python = ">=3.12"
# dependencies = ["openai==2.54.0", "httpx==0.28.1"]
# ///
"""Bounded official-SDK temperature/effort matrix over an original arithmetic fixture."""

import argparse
import hashlib
import json
import os
import random
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

import openai
from openai import OpenAI
from responses_probe import output_shape, price, token_usage

PROMPT = (
    "以下是原创合成资料，只根据当前有效来源计算。"
    "S1：资料甲v1有18页但已撤回，当前有效v2有20页；不得同时计入两个版本。"
    "S2：资料乙当前有效版本有24页。S3：每个有效页面生成3道候选题。"
    "S4：这批候选题中9道审核失败，不得计入可学习题数。"
    "S5：每天最多完成14道可学习题，最后一天不足14道也算一个完整学习日。"
    "请给出有效总页数、候选题数、可学习题数和最少学习天数。"
    "仅输出JSON，字段为total_pages、generated_questions、eligible_questions、minimum_days、source_ids。"
    "前四项是整数，source_ids列出用于计算的全部来源编号；不要输出解释或代码围栏。"
)
EXPECTED = {
    "total_pages": 44,
    "generated_questions": 132,
    "eligible_questions": 123,
    "minimum_days": 9,
}
SCHEMA = {
    "type": "object",
    "properties": {
        **{key: {"type": "integer"} for key in EXPECTED},
        "source_ids": {"type": "array", "items": {"type": "string"}},
    },
    "required": [*EXPECTED, "source_ids"],
    "additionalProperties": False,
}
SOURCE_IDS = {"S1", "S2", "S3", "S4", "S5"}


def run_case(client: OpenAI, case: dict, rates: dict | None) -> dict:
    row = {
        **case,
        "max_output_tokens": 16384,
        "automatic_retries": 0,
        "real_data_enabled": False,
    }
    started = time.perf_counter()
    first_text_seconds = None
    response = None
    deltas = []
    event_counts = Counter()
    try:
        result = client.responses.create(
            model=case["model"],
            input=PROMPT,
            store=False,
            max_output_tokens=16384,
            temperature=case["temperature"],
            reasoning={"effort": case["effort"]},
            text={
                "format": {
                    "type": "json_schema",
                    "name": "synthetic_volume_math",
                    "strict": True,
                    "schema": SCHEMA,
                }
            },
            stream=case["stream"],
        )
        if case["stream"]:
            with result:
                for event in result:
                    if time.perf_counter() - started > 120:
                        raise TimeoutError
                    event_counts[event.type] += 1
                    if event.type == "response.output_text.delta":
                        if first_text_seconds is None:
                            first_text_seconds = time.perf_counter() - started
                        deltas.append(event.delta)
                    if event.type in {
                        "response.completed",
                        "response.failed",
                        "response.incomplete",
                    }:
                        response = event.response
        else:
            response = result
        row["http_status"] = 200
        row["event_counts"] = dict(event_counts)
        row["first_text_seconds"] = (
            round(first_text_seconds, 3) if first_text_seconds is not None else None
        )
        if response is None:
            row.update(
                {
                    "candidate_available": False,
                    "category": "stream_without_terminal",
                    "usage": None,
                }
            )
        else:
            text = response.output_text
            wire = response.model_dump(mode="json", exclude_unset=True)
            usage = token_usage(wire.get("usage"))
            try:
                value = json.loads(text)
            except (ValueError, TypeError):
                value = None
            score = sum(
                isinstance(value, dict)
                and type(value.get(key)) is int
                and value[key] == expected
                for key, expected in EXPECTED.items()
            )
            references = value.get("source_ids") if isinstance(value, dict) else None
            references_valid = (
                isinstance(references, list)
                and all(isinstance(v, str) for v in references)
                and len(references) == 5
                and set(references) == SOURCE_IDS
            )
            correct = (
                isinstance(value, dict)
                and set(value) == set(SCHEMA["required"])
                and score == 4
                and references_valid
            )
            delta_matches = not case["stream"] or "".join(deltas) == text
            allowed_items = all(
                item.type in {"message", "reasoning"} for item in response.output
            )
            row.update(
                {
                    "status": response.status,
                    "response_model": response.model,
                    "output_shape": output_shape(wire),
                    "usage": usage,
                    "temperature_echo": getattr(response, "temperature", None),
                    "effort_echo": getattr(
                        getattr(response, "reasoning", None), "effort", None
                    ),
                    "max_output_tokens_echo": getattr(
                        response, "max_output_tokens", None
                    ),
                    "numeric_score_out_of_4": score,
                    "source_ids_valid": references_valid,
                    "synthetic_answer_valid": correct,
                    "final_text_characters": len(text),
                    "delta_matches_final_text": delta_matches,
                    "text_sha256": hashlib.sha256(text.encode()).hexdigest()
                    if text
                    else None,
                    "validated_synthetic_answer": {
                        **EXPECTED,
                        "source_ids": sorted(SOURCE_IDS),
                    }
                    if correct
                    else None,
                    "candidate_available": response.status == "completed"
                    and correct
                    and delta_matches
                    and allowed_items
                    and getattr(response, "error", None) is None,
                }
            )
            row["category"] = (
                "completed_candidate"
                if row["candidate_available"]
                else "no_final_text"
                if not text
                else "synthetic_format_or_answer_failure"
            )
    except openai.APIStatusError as exc:
        row.update(
            {
                "candidate_available": False,
                "category": "sdk_http_error",
                "http_status": exc.status_code,
                "sdk_error_type": type(exc).__name__,
                "usage": None,
            }
        )
    except (openai.APIError, TimeoutError, AttributeError, TypeError, ValueError):
        row.update(
            {
                "candidate_available": False,
                "category": "sdk_or_transport_outcome_unknown",
                "usage": None,
            }
        )
    row["elapsed_seconds"] = round(time.perf_counter() - started, 3)
    row.update(price(row.get("usage"), rates))
    return row


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
        or not all(models)
        or len(models) > 3
    ):
        parser.error("Configure HTTPS base, runtime key and 1–3 exact model aliases")
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
    if "glm-5.3" in models:
        cases += [
            {
                "model": "glm-5.3",
                "temperature": 0.0,
                "effort": effort,
                "repeat": 1,
                "stream": False,
            }
            for effort in ("low", "high")
        ]
    results = {
        "date": "2026-10-12",
        "scope": "Official SDK synthetic arithmetic/version/quality fixture; randomized streaming matrix with two repeats; GLM nonstream probes separate",
        "openai": openai.__version__,
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "prompt_sha256": hashlib.sha256(PROMPT.encode()).hexdigest(),
        "output_cap": 16384,
        "max_requests": len(cases),
        "runs": [],
        "real_data_enabled": False,
        "upstream_parameter_application_verified": False,
    }
    with OpenAI(base_url=base, api_key=key, max_retries=0, timeout=60.0) as client:
        for i, case in enumerate(cases, 1):
            row = run_case(client, case, rates.get(case["model"]))
            results["runs"].append(row)
            args.output.write_text(
                json.dumps(results, ensure_ascii=False, indent=2) + "\n"
            )
            print(
                f"{i}/{len(cases)} {case['model']} t={case['temperature']} effort={case['effort']} stream={case['stream']} {row['category']} {row['elapsed_seconds']}s",
                flush=True,
            )


if __name__ == "__main__":
    main()
