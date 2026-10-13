# /// script
# requires-python = ">=3.12"
# dependencies = ["openai==2.54.0", "httpx==0.28.1"]
# ///
"""Call the aggregator directly through the official OpenAI SDK on synthetic facts.

Credentials are supplied only via runtime environment. No raw model/reasoning text,
error bodies, endpoint or credentials are saved. SDK transport/typed objects are used
directly; the earlier raw HTTP normalizer is not applied to SDK responses.
"""

import argparse
import hashlib
import json
import os
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

import openai
from openai import OpenAI
from responses_probe import (
    SCHEMA,
    SYNTHETIC,
    ProtocolError,
    output_shape,
    price,
    token_usage,
)


def summarize(response, row: dict) -> None:
    # SDK's helper reads typed output items even when the vendor omits message.status.
    text = response.output_text
    wire = response.model_dump(mode="json", exclude_unset=True)
    row.update(
        {
            "response_model": response.model,
            "status": response.status,
            "sdk_output_text_available": bool(text),
            "text_characters": len(text),
            "text_sha256": hashlib.sha256(text.encode()).hexdigest() if text else None,
            "output_shape": output_shape(wire),
            "message_status_fields_present": [
                "status" in item.model_fields_set
                for item in response.output
                if item.type == "message"
            ],
            "message_status_values": [
                getattr(item, "status", None)
                for item in response.output
                if item.type == "message"
            ],
            "store_echo": getattr(response, "store", None),
            "zero_retention_verified": False,
            "response_id_sha256": hashlib.sha256(response.id.encode()).hexdigest(),
        }
    )
    usage = wire.get("usage")
    try:
        row["usage"] = token_usage(usage)
    except ProtocolError:
        row["usage"] = None
        row["usage_validation_error"] = True
    details = getattr(response, "incomplete_details", None)
    row["incomplete_reason"] = getattr(details, "reason", None)
    refused = any(
        part.type == "refusal"
        for item in response.output
        if item.type == "message"
        for part in item.content
    )
    try:
        value = json.loads(text)
    except (ValueError, TypeError):
        value = None
    row["synthetic_answer_valid"] = (
        isinstance(value, dict)
        and set(value) == {"answer", "source_id"}
        and value["answer"] == "后进先出"
        and value["source_id"] == "S1"
    )
    row["candidate_available"] = (
        response.status == "completed"
        and not refused
        and bool(text)
        and row["synthetic_answer_valid"]
        and getattr(response, "error", None) is None
    )
    # Only already-validated synthetic fields are retained, never arbitrary model output.
    row["validated_synthetic_answer"] = value if row["synthetic_answer_valid"] else None
    row["category"] = (
        "completed_candidate"
        if row["candidate_available"]
        else "refusal"
        if refused
        else response.status
        if response.status != "completed"
        else "synthetic_format_or_answer_failure"
    )


def call(
    client: OpenAI,
    model: str,
    stream: bool,
    strict: bool,
    max_tokens: int,
    rates: dict | None,
) -> dict:
    row = {
        "requested_model": model,
        "stream": stream,
        "strict_schema": strict,
        "max_output_tokens": max_tokens,
        "retry_attempts": 0,
        "real_data_enabled": False,
    }
    params = {
        "model": model,
        "input": SYNTHETIC,
        "store": False,
        "stream": stream,
        "max_output_tokens": max_tokens,
    }
    if strict:
        params["text"] = {
            "format": {
                "type": "json_schema",
                "name": "synthetic_stack",
                "strict": True,
                "schema": SCHEMA,
            }
        }
    started = time.perf_counter()
    try:
        result = client.responses.create(**params)
        if stream:
            counts = Counter()
            terminal = None
            delta_parts = []
            with result:
                for event in result:
                    if time.perf_counter() - started > 120:
                        raise TimeoutError
                    counts[event.type] += 1
                    if event.type == "response.output_text.delta":
                        delta_parts.append(event.delta)
                    if event.type in {
                        "response.completed",
                        "response.failed",
                        "response.incomplete",
                    }:
                        terminal = event.response
            row["event_counts"] = dict(counts)
            row["terminal_received"] = terminal is not None
            if terminal is None:
                row.update(
                    {
                        "candidate_available": False,
                        "category": "stream_without_terminal",
                        "usage": None,
                    }
                )
            else:
                summarize(terminal, row)
                row["delta_matches_final_text"] = (
                    "".join(delta_parts) == terminal.output_text
                )
                if not row["delta_matches_final_text"]:
                    row.update(
                        {
                            "candidate_available": False,
                            "category": "stream_text_mismatch",
                        }
                    )
        else:
            summarize(result, row)
        row["http_status"] = 200
    except openai.APIStatusError as exc:
        row.update(
            {
                "candidate_available": False,
                "category": "sdk_http_error",
                "sdk_error_type": type(exc).__name__,
                "http_status": exc.status_code,
                "usage": None,
            }
        )
    except (openai.APIConnectionError, openai.APITimeoutError, TimeoutError):
        row.update(
            {
                "candidate_available": False,
                "category": "transport_outcome_unknown",
                "usage": None,
            }
        )
    except (openai.APIResponseValidationError, AttributeError, TypeError, ValueError):
        row.update(
            {
                "candidate_available": False,
                "category": "sdk_response_shape_error",
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
    parser.add_argument("--max-output-tokens", type=int, default=16384)
    parser.add_argument("--error-probe", action="store_true")
    args = parser.parse_args()
    if not 1024 <= args.max_output_tokens <= 16384:
        parser.error("Use an explicit 1024–16384 token output cap")
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
        parser.error(
            "Configure HTTPS CL005_MODEL_BASE_URL, CL005_MODEL_API_KEY and 1–3 exact CL005_MODEL_ALIASES"
        )
    rates = json.loads(args.rates.read_text())
    for value in rates.values():
        price({"input_tokens": 1, "output_tokens": 1, "cached_tokens": 0}, value)
    with OpenAI(base_url=base, api_key=key, max_retries=0, timeout=60.0) as client:
        runs = [
            call(
                client, model, stream, strict, args.max_output_tokens, rates.get(model)
            )
            for model in models
            for stream, strict in [(False, False), (False, True), (True, False)]
        ]
        if args.error_probe:
            runs.append(
                call(
                    client,
                    "canlearn-cl005-nonexistent-model",
                    False,
                    False,
                    args.max_output_tokens,
                    None,
                )
            )
    report = {
        "date": "2026-10-12",
        "scope": "Official Python SDK direct aggregator synthetic probes; no raw HTTP normalization applied",
        "openai": openai.__version__,
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "max_retries": 0,
        "timeout_seconds": 60,
        "request_count": len(runs),
        "runs": runs,
        "real_data_enabled": False,
    }
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"Saved {args.output.name}; SDK {openai.__version__}, {len(runs)} requests")


if __name__ == "__main__":
    main()
