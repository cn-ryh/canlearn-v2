# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx==0.28.1"]
# ///
"""Isolated Responses contract probe; sends only a hardcoded synthetic task.

This is not a deployed gateway. Never persists credentials, endpoint, prompt, raw
error bodies or model text. No retry, redirect, fallback, remote tools or state.
"""

import argparse
import hashlib
import json
import os
import time
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit

import httpx

SYNTHETIC = "原创合成资料：编号 S1，栈采用后进先出。编号 S2，队列采用先进先出。请仅输出 JSON，字段 answer 为栈的取出顺序、source_id 为支持答案的编号。"
SCHEMA = {
    "type": "object",
    "properties": {"answer": {"type": "string"}, "source_id": {"type": "string"}},
    "required": ["answer", "source_id"],
    "additionalProperties": False,
}
MAX_BYTES = 1024 * 1024


class ProtocolError(Exception):
    """Category only; external payloads must never be copied into this exception."""


@dataclass
class Candidate:
    report: dict
    text: str = ""  # Only in memory; caller still applies business admission and quality checks.


def token_usage(value) -> dict | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ProtocolError("invalid_usage")
    fields = ("input_tokens", "output_tokens", "total_tokens")
    if any(type(value.get(k)) is not int or value[k] < 0 for k in fields):
        raise ProtocolError("invalid_usage")
    if value["input_tokens"] + value["output_tokens"] != value["total_tokens"]:
        raise ProtocolError("invalid_usage")
    input_details = value.get("input_tokens_details", {})
    output_details = value.get("output_tokens_details", {})
    input_details = {} if input_details is None else input_details
    output_details = {} if output_details is None else output_details
    if not isinstance(input_details, dict) or not isinstance(output_details, dict):
        raise ProtocolError("invalid_usage")
    cached = input_details.get("cached_tokens", 0)
    reasoning = output_details.get("reasoning_tokens", 0)
    if type(cached) is not int or not 0 <= cached <= value["input_tokens"]:
        raise ProtocolError("invalid_usage")
    if type(reasoning) is not int or not 0 <= reasoning <= value["output_tokens"]:
        raise ProtocolError("invalid_usage")
    return {
        **{k: value[k] for k in fields},
        "cached_tokens": cached,
        "reasoning_tokens": reasoning,
    }


def output_shape(value: dict) -> dict:
    """Allowlisted structure only; never retain message/reasoning/refusal text."""
    items = value.get("output")
    if not isinstance(items, list):
        return {"output_array": False}
    shapes = []
    for item in items[:32]:
        if not isinstance(item, dict):
            shapes.append({"type": "invalid"})
            continue
        content = item.get("content")
        shapes.append(
            {
                "type": item.get("type")
                if item.get("type") in ("message", "reasoning", "function_call")
                else "other",
                "role": item.get("role")
                if item.get("role") in ("assistant", "user", "system")
                else "absent_or_other",
                "status": item.get("status")
                if item.get("status") in ("completed", "in_progress", "incomplete")
                else "absent_or_other",
                "content_types": [
                    part.get("type")
                    if isinstance(part, dict)
                    and part.get("type") in ("output_text", "refusal")
                    else "other"
                    for part in content[:64]
                ]
                if isinstance(content, list)
                else None,
            }
        )
    return {"output_array": True, "output_items": len(items), "items": shapes}


def normalize(response: dict, profile: str = "strict") -> Candidate:
    if profile not in ("strict", "completed_message_status_optional"):
        raise ProtocolError("unknown_provider_profile")
    if not isinstance(response, dict) or response.get("object") != "response":
        raise ProtocolError("invalid_response")
    if not isinstance(response.get("id"), str) or not isinstance(
        response.get("model"), str
    ):
        raise ProtocolError("missing_response_identity")
    status = response.get("status")
    if not isinstance(status, str) or status not in {
        "completed",
        "failed",
        "incomplete",
        "in_progress",
        "queued",
        "cancelled",
    }:
        raise ProtocolError("invalid_status")
    usage = token_usage(response.get("usage"))
    report = {
        "status": status,
        "response_model": response["model"],
        "response_id_sha256": hashlib.sha256(response["id"].encode()).hexdigest(),
        "usage": usage,
        "cost_state": "usage_observed_unpriced"
        if usage
        else "unknown_pending_reconciliation",
        "candidate_available": False,
        "normalization_profile": profile,
        "compatibility_warnings": [],
        "category": status,
        "store_echo": response.get("store"),
        "output_shape": output_shape(response),
        "zero_retention_verified": False,
    }
    if status != "completed":
        details = response.get("incomplete_details")
        if isinstance(details, dict):
            reason = details.get("reason")
            report["incomplete_reason"] = (
                reason if reason in ("max_output_tokens", "content_filter") else "other"
            )
        return Candidate(report)
    if response.get("store") is True:
        report["category"] = "store_false_not_honored"
        return Candidate(report)
    if (
        response.get("error") is not None
        or response.get("incomplete_details") is not None
    ):
        raise ProtocolError("contradictory_completed_state")
    output = response.get("output")
    if not isinstance(output, list):
        raise ProtocolError("invalid_output")
    parts = []
    refused = False
    for item in output:
        if not isinstance(item, dict):
            raise ProtocolError("invalid_output")
        if item.get("type") == "reasoning":
            continue  # No chain of thought / summaries / encrypted state retained.
        infer_status = (
            item.get("status") is None
            and profile == "completed_message_status_optional"
        )
        if (
            item.get("type") != "message"
            or item.get("role") != "assistant"
            or (item.get("status") != "completed" and not infer_status)
        ):
            raise ProtocolError("unexpected_output_item")
        if infer_status:
            report["compatibility_warnings"].append(
                "message_status_inferred_from_completed_envelope"
            )
        if not isinstance(item.get("content"), list):
            raise ProtocolError("invalid_content")
        for content in item["content"]:
            if not isinstance(content, dict):
                raise ProtocolError("invalid_content")
            if content.get("type") == "refusal":
                refused = True
            elif content.get("type") == "output_text" and isinstance(
                content.get("text"), str
            ):
                parts.append(content["text"])
            else:
                raise ProtocolError("unexpected_content")
    if refused:
        report["category"] = "refusal"
        return Candidate(report)
    text = "".join(parts)
    if not text.strip():
        raise ProtocolError("empty_completed_output")
    report.update(
        {
            "candidate_available": True,
            "category": "completed_candidate",
            "text_sha256": hashlib.sha256(text.encode()).hexdigest(),
            "text_characters": len(text),
        }
    )
    return Candidate(report, text)


def consume_sse(lines, profile: str = "strict") -> Candidate:
    terminal = None
    last_sequence = -1
    seen = {}
    event_name = None
    data = []
    deltas = {}  # Map each output/content part separately; never flatten interleaved lanes.
    total_bytes = 0
    event_count = 0
    duplicates = 0
    response_id = None
    started = time.perf_counter()

    def dispatch() -> None:
        nonlocal terminal, last_sequence, event_count, duplicates, response_id
        if not data:
            return
        raw = "\n".join(data)
        if raw == "[DONE]":
            return  # [DONE] without a Responses terminal event is not success.
        try:
            event = json.loads(raw)
        except (ValueError, TypeError) as exc:
            raise ProtocolError("invalid_sse_json") from exc
        if not isinstance(event, dict) or not isinstance(event.get("type"), str):
            raise ProtocolError("invalid_sse_event")
        kind = event["type"]
        if event_name is not None and event_name != kind:
            raise ProtocolError("sse_event_type_mismatch")
        sequence = event.get("sequence_number")
        if type(sequence) is not int or sequence < 0:
            raise ProtocolError("missing_sse_sequence")
        if sequence in seen:
            if seen[sequence] != raw:
                raise ProtocolError("conflicting_sse_duplicate")
            duplicates += 1
            return
        if terminal is not None or sequence <= last_sequence:
            raise ProtocolError("sse_out_of_order")
        seen[sequence] = raw
        last_sequence = sequence
        event_count += 1
        if kind == "response.created":
            created = event.get("response")
            if not isinstance(created, dict) or not isinstance(created.get("id"), str):
                raise ProtocolError("missing_response_identity")
            response_id = created["id"]
        if kind == "error":
            raise ProtocolError("provider_stream_error")
        if kind == "response.output_text.delta":
            key = (event.get("output_index"), event.get("content_index"))
            if any(type(v) is not int or v < 0 for v in key) or not isinstance(
                event.get("delta"), str
            ):
                raise ProtocolError("invalid_text_delta")
            deltas[key] = deltas.get(key, "") + event["delta"]
        if kind in {"response.completed", "response.failed", "response.incomplete"}:
            terminal = event.get("response")
            if (
                not isinstance(terminal, dict)
                or terminal.get("status") != kind.split(".")[1]
            ):
                raise ProtocolError("sse_terminal_status_mismatch")
            if response_id is not None and terminal.get("id") != response_id:
                raise ProtocolError("sse_response_identity_mismatch")

    for line in lines:
        if time.perf_counter() - started > 60:
            raise ProtocolError("stream_deadline")
        total_bytes += len(line.encode()) + 1
        if total_bytes > MAX_BYTES:
            raise ProtocolError("response_too_large")
        if not line:
            dispatch()
            event_name, data = None, []
        elif line.startswith("event:"):
            event_name = line[6:].strip()
        elif line.startswith("data:"):
            data.append(line[5:].lstrip(" "))
        # Comments, retry and id are transport fields; no reconnect is attempted.
    dispatch()
    if terminal is None:
        raise ProtocolError("stream_without_terminal")
    candidate = normalize(terminal, profile)
    if candidate.report["candidate_available"]:
        for (output_index, content_index), text in deltas.items():
            try:
                final = terminal["output"][output_index]["content"][content_index]
            except (KeyError, IndexError, TypeError) as exc:
                raise ProtocolError("stream_text_mismatch") from exc
            if final.get("type") != "output_text" or final.get("text") != text:
                raise ProtocolError("stream_text_mismatch")
    candidate.report["sse_events"] = event_count
    candidate.report["sse_duplicates_ignored"] = duplicates
    return candidate


def price(usage: dict | None, rates: dict | None) -> dict:
    if usage is None or rates is None:
        return {
            "estimated_cost": None,
            "currency": rates.get("currency") if rates else None,
            "billing_verified": False,
        }

    def rate(key: str) -> Decimal:
        number = Decimal(str(rates[key]))
        if not number.is_finite() or number < 0:
            raise ValueError("Invalid price")
        return number

    cached = usage["cached_tokens"]
    # Reasoning tokens are already included in output_tokens; never add twice.
    known = (
        (usage["input_tokens"] - cached) * rate("input_per_million")
        + usage["output_tokens"] * rate("output_per_million")
    ) / Decimal(1_000_000)
    cache_rate = (
        rate("cached_input_per_million")
        if rates.get("cached_input_per_million") is not None
        else None
    )
    if cached and cache_rate is None:
        return {
            "estimated_cost": None,
            "known_components_cost": str(known),
            "cached_tokens_unpriced": cached,
            "estimated_cost_if_cached_billed_as_input": str(
                known + cached * rate("input_per_million") / Decimal(1_000_000)
            ),
            "cost_state": "cached_rate_unknown",
            "currency": rates["currency"],
            "billing_verified": False,
            "price_evidence": rates["evidence_id"],
        }
    amount = known + cached * (cache_rate or Decimal(0)) / Decimal(1_000_000)
    return {
        "estimated_cost": str(amount),
        "cost_state": "estimated_from_quote",
        "currency": rates["currency"],
        "billing_verified": False,
        "price_evidence": rates["evidence_id"],
    }


def probe(
    client: httpx.Client,
    endpoint: str,
    key: str,
    model: str,
    stream: bool,
    strict: bool,
    rates: dict | None = None,
    profile: str = "strict",
    max_tokens: int = 16384,
) -> dict:
    payload = {
        "model": model,
        "input": SYNTHETIC,
        "store": False,
        "stream": stream,
        "max_output_tokens": max_tokens,
    }
    if strict:
        payload["text"] = {
            "format": {
                "type": "json_schema",
                "name": "synthetic_stack",
                "strict": True,
                "schema": SCHEMA,
            }
        }
    started = time.perf_counter()
    report = {
        "requested_model": model,
        "stream": stream,
        "strict_schema": strict,
        "retry_attempts": 0,
        "supplier_admitted_for_real_data": False,
        "normalization_profile": profile,
        "max_output_tokens": max_tokens,
    }
    try:
        with client.stream(
            "POST", endpoint, headers={"Authorization": f"Bearer {key}"}, json=payload
        ) as response:
            report["http_status"] = response.status_code
            request_id = response.headers.get("x-request-id")
            report["request_id_sha256"] = (
                hashlib.sha256(request_id.encode()).hexdigest() if request_id else None
            )
            if response.status_code != 200:
                report.update(
                    {
                        "candidate_available": False,
                        "category": {
                            400: "configuration_or_input_error",
                            401: "authentication",
                            403: "authorization",
                            404: "endpoint_or_model_unavailable",
                            429: "rate_limit",
                        }.get(response.status_code, "provider_http_error"),
                        "cost_state": "unknown_pending_reconciliation",
                    }
                )
                retry = response.headers.get("retry-after", "")
                report["retry_after_seconds"] = (
                    int(retry) if retry.isdigit() and len(retry) < 8 else None
                )
                return report
            content_type = (
                response.headers.get("content-type", "").split(";")[0].strip()
            )
            if stream:
                if content_type != "text/event-stream":
                    raise ProtocolError("unexpected_stream_content_type")
                candidate = consume_sse(response.iter_lines(), profile)
            else:
                if content_type != "application/json":
                    raise ProtocolError("unexpected_json_content_type")
                raw = bytearray()
                for part in response.iter_bytes():
                    if time.perf_counter() - started > 60:
                        raise ProtocolError("response_deadline")
                    raw.extend(part)
                    if len(raw) > MAX_BYTES:
                        raise ProtocolError("response_too_large")
                try:
                    parsed = json.loads(raw)
                except (ValueError, TypeError) as exc:
                    raise ProtocolError("invalid_response_json") from exc
                if isinstance(parsed, dict):
                    report["output_shape"] = output_shape(parsed)
                    observed = token_usage(parsed.get("usage"))
                    report["usage"] = observed
                    report["cost_state"] = (
                        "usage_observed_unpriced"
                        if observed
                        else "unknown_pending_reconciliation"
                    )
                    report.update(price(observed, rates))
                candidate = normalize(parsed, profile)
            report.update(candidate.report)
            report.update(price(candidate.report["usage"], rates))
            if candidate.text:
                try:
                    value = json.loads(candidate.text)
                except ValueError:
                    value = None
                report["synthetic_answer_valid"] = (
                    isinstance(value, dict)
                    and set(value) == {"answer", "source_id"}
                    and value["answer"] == "后进先出"
                    and value["source_id"] == "S1"
                )
                if not report["synthetic_answer_valid"]:
                    report.update(
                        {
                            "candidate_available": False,
                            "category": "synthetic_quality_failure",
                        }
                    )
    except (httpx.TimeoutException, httpx.TransportError):
        report.update(
            {
                "candidate_available": False,
                "category": "transport_outcome_unknown",
                "cost_state": report.get(
                    "cost_state", "unknown_pending_reconciliation"
                ),
            }
        )
    except ProtocolError as exc:
        report.update(
            {
                "candidate_available": False,
                "category": str(exc),
                "cost_state": report.get(
                    "cost_state", "unknown_pending_reconciliation"
                ),
            }
        )
    finally:
        report["elapsed_seconds"] = round(time.perf_counter() - started, 3)
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-output-tokens", type=int, default=16384)
    parser.add_argument(
        "--profile",
        choices=["strict", "completed_message_status_optional"],
        default="strict",
    )
    parser.add_argument(
        "--rates", type=Path, help="Local non-secret JSON indexed by exact model alias"
    )
    args = parser.parse_args()
    if not 128 <= args.max_output_tokens <= 16384:
        parser.error("Use an explicit 128–16384 token output cap")
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
    ):
        parser.error(
            "Configure CL005_MODEL_BASE_URL as an HTTPS API base, including /v1 if needed"
        )
    if not key or not all(models) or len(models) > 3:
        parser.error(
            "Configure an API key and 1–3 exact aliases via CL005_MODEL_API_KEY / CL005_MODEL_ALIASES"
        )
    rate_table = json.loads(args.rates.read_text()) if args.rates else {}
    for rates in rate_table.values():
        # Validate before making any paid request; this does not verify supplier prices.
        price({"input_tokens": 1, "output_tokens": 1, "cached_tokens": 0}, rates)
    runs = []
    # Deliberately no default external endpoint, automatic model discovery or error-load generation.
    with httpx.Client(
        timeout=httpx.Timeout(30, connect=10), follow_redirects=False
    ) as client:
        for model in models:
            for stream, strict in ((False, False), (False, True), (True, False)):
                runs.append(
                    probe(
                        client,
                        base + "/responses",
                        key,
                        model,
                        stream,
                        strict,
                        rate_table.get(model),
                        args.profile,
                        args.max_output_tokens,
                    )
                )
    result = {
        "scope": "live synthetic probe",
        "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "max_paid_requests": len(models) * 3,
        "max_output_tokens_each": args.max_output_tokens,
        "runs": runs,
        "real_data_enabled": False,
    }
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        f"Saved {args.output.name}; {len(runs)} synthetic requests; no real-data admission"
    )


if __name__ == "__main__":
    main()
