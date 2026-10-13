"""Contract fault injection for the isolated CL-005c prototype, not supplier tests."""

import copy
import json

import httpx
import pytest
from responses_probe import ProtocolError, consume_sse, normalize, price, probe

TEXT = '{"answer":"后进先出","source_id":"S1"}'


def response() -> dict:
    return {
        "id": "resp_synthetic",
        "object": "response",
        "model": "synthetic-model",
        "status": "completed",
        "store": False,
        "error": None,
        "output": [
            {
                "id": "msg_synthetic",
                "type": "message",
                "role": "assistant",
                "status": "completed",
                "content": [{"type": "output_text", "text": TEXT}],
            }
        ],
        "usage": {
            "input_tokens": 100,
            "output_tokens": 30,
            "total_tokens": 130,
            "input_tokens_details": {"cached_tokens": 20},
            "output_tokens_details": {"reasoning_tokens": 10},
        },
    }


def lines(events: list[dict]) -> list[str]:
    return [
        line
        for event in events
        for line in ["event: " + event["type"], "data: " + json.dumps(event), ""]
    ]


def events() -> list[dict]:
    return [
        {
            "type": "response.created",
            "sequence_number": 0,
            "response": {"id": "resp_synthetic"},
        },
        {
            "type": "response.output_text.delta",
            "sequence_number": 1,
            "output_index": 0,
            "content_index": 0,
            "delta": TEXT,
        },
        {"type": "response.completed", "sequence_number": 2, "response": response()},
    ]


def test_multiple_segments_reasoning_and_usage():
    value = response()
    value["output"].insert(0, {"type": "reasoning", "summary": [{"text": "private"}]})
    value["output"][1]["content"] = [
        {"type": "output_text", "text": TEXT[:12]},
        {"type": "output_text", "text": TEXT[12:]},
    ]
    candidate = normalize(value)
    assert candidate.text == TEXT
    assert "private" not in json.dumps(candidate.report)
    assert candidate.report["usage"]["reasoning_tokens"] == 10


@pytest.mark.parametrize(
    "status", ["incomplete", "failed", "queued", "in_progress", "cancelled"]
)
def test_http_200_is_not_terminal_success(status):
    value = response()
    value["status"] = status
    assert not normalize(value).report["candidate_available"]


def test_refusal_discards_even_accompanying_text():
    value = response()
    value["output"][0]["content"].append({"type": "refusal", "refusal": "secret"})
    result = normalize(value)
    assert result.report["category"] == "refusal" and result.text == ""


def test_store_false_is_not_honored():
    value = response()
    value["store"] = True
    result = normalize(value)
    assert result.report["category"] == "store_false_not_honored"
    assert result.text == "" and not result.report["candidate_available"]


@pytest.mark.parametrize(
    "mutation,category",
    [
        (lambda v: v.update(object="chat.completion"), "invalid_response"),
        (lambda v: v.update(status="unknown"), "invalid_status"),
        (
            lambda v: v.update(error={"message": "secret"}),
            "contradictory_completed_state",
        ),
        (
            lambda v: v.update(output=[{"type": "function_call"}]),
            "unexpected_output_item",
        ),
        (lambda v: v.update(output=[]), "empty_completed_output"),
        (lambda v: v["usage"].update(input_tokens=-1), "invalid_usage"),
        (lambda v: v["usage"].update(total_tokens=999), "invalid_usage"),
        (lambda v: v["usage"].update(input_tokens=True), "invalid_usage"),
        (lambda v: v["usage"].update(input_tokens_details=[1]), "invalid_usage"),
        (
            lambda v: v["usage"]["input_tokens_details"].update(cached_tokens=101),
            "invalid_usage",
        ),
        (
            lambda v: v["usage"]["output_tokens_details"].update(reasoning_tokens=31),
            "invalid_usage",
        ),
    ],
)
def test_invalid_response_rejected(mutation, category):
    value = response()
    mutation(value)
    with pytest.raises(ProtocolError, match=category):
        normalize(value)


def test_missing_usage_never_means_zero_cost():
    value = response()
    value.pop("usage")
    result = normalize(value)
    assert result.report["cost_state"] == "unknown_pending_reconciliation"
    assert price(result.report["usage"], None)["estimated_cost"] is None


def test_cached_input_and_reasoning_accounted_once():
    rates = {
        "input_per_million": "2",
        "cached_input_per_million": "0.5",
        "output_per_million": "8",
        "currency": "SYNTHETIC",
        "evidence_id": "fixture-only",
    }
    actual = price(normalize(response()).report["usage"], rates)
    assert actual["estimated_cost"] == "0.00041"
    assert actual["billing_verified"] is False


def test_unknown_cached_price_keeps_cost_partial():
    rates = {
        "input_per_million": "2",
        "cached_input_per_million": None,
        "output_per_million": "8",
        "currency": "SYNTHETIC",
        "evidence_id": "fixture-only",
    }
    actual = price(normalize(response()).report["usage"], rates)
    assert actual["estimated_cost"] is None and actual["cached_tokens_unpriced"] == 20
    assert actual["known_components_cost"] == "0.0004"
    assert actual["estimated_cost_if_cached_billed_as_input"] == "0.00044"


def test_explicit_missing_status_profile_and_incomplete_guard():
    value = response()
    value["output"][0].pop("status")
    actual = normalize(value, "completed_message_status_optional")
    assert actual.report["candidate_available"] and actual.text == TEXT
    assert actual.report["compatibility_warnings"] == [
        "message_status_inferred_from_completed_envelope"
    ]
    value["status"] = "incomplete"
    assert not normalize(value, "completed_message_status_optional").report[
        "candidate_available"
    ]


def test_profile_never_overrides_explicit_incomplete_message():
    value = response()
    value["output"][0]["status"] = "incomplete"
    with pytest.raises(ProtocolError, match="unexpected_output_item"):
        normalize(value, "completed_message_status_optional")


def test_sse_repeated_sequence_is_deduplicated():
    value = events()
    value.insert(2, copy.deepcopy(value[1]))
    result = consume_sse(lines(value))
    assert result.text == TEXT and result.report["sse_duplicates_ignored"] == 1


@pytest.mark.parametrize(
    "case,category",
    [
        ("drop", "stream_without_terminal"),
        ("conflict", "conflicting_sse_duplicate"),
        ("reorder", "sse_out_of_order"),
        ("text", "stream_text_mismatch"),
        ("status", "sse_terminal_status_mismatch"),
        ("identity", "sse_response_identity_mismatch"),
        ("sequence", "missing_sse_sequence"),
    ],
)
def test_stream_faults_fail_closed(case, category):
    value = events()
    if case == "drop":
        value.pop()
    elif case == "conflict":
        duplicate = copy.deepcopy(value[1])
        duplicate["delta"] = "different"
        value.insert(2, duplicate)
    elif case == "reorder":
        value[0]["sequence_number"] = 3
    elif case == "text":
        value[1]["delta"] = "different"
    elif case == "status":
        value[-1]["response"]["status"] = "incomplete"
    elif case == "identity":
        value[-1]["response"]["id"] = "resp_other"
    elif case == "sequence":
        value[1].pop("sequence_number")
    with pytest.raises(ProtocolError, match=category):
        consume_sse(lines(value))


def test_done_marker_cannot_complete_a_partial_stream():
    with pytest.raises(ProtocolError, match="stream_without_terminal"):
        consume_sse(["data: [DONE]", ""])


@pytest.mark.parametrize(
    "status,category",
    [
        (400, "configuration_or_input_error"),
        (401, "authentication"),
        (403, "authorization"),
        (404, "endpoint_or_model_unavailable"),
        (429, "rate_limit"),
        (500, "provider_http_error"),
        (302, "provider_http_error"),
    ],
)
def test_http_errors_no_redirect_retry_or_body_logging(status, category):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(
            status,
            headers={"retry-after": "2", "location": "https://unapproved.invalid"},
            text="secret prompt and key",
        )

    with httpx.Client(
        transport=httpx.MockTransport(handler), follow_redirects=False
    ) as client:
        result = probe(
            client,
            "https://synthetic.invalid/v1/responses",
            "secret_key",
            "synthetic-model",
            False,
            False,
        )
    assert len(calls) == 1 and result["category"] == category
    assert result["candidate_available"] is False and result["retry_attempts"] == 0
    assert "secret" not in json.dumps(result)


def test_synthetic_http_request_and_output_validation():
    def handler(request):
        body = json.loads(request.content)
        assert body["store"] is False and body["stream"] is False
        assert "tools" not in body and "previous_response_id" not in body
        assert body["text"]["format"]["strict"] is True
        return httpx.Response(200, json=response())

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = probe(
            client,
            "https://synthetic.invalid/v1/responses",
            "synthetic-key",
            "synthetic-model",
            False,
            True,
        )
    assert result["candidate_available"] and result["synthetic_answer_valid"]
    assert (
        result["estimated_cost"] is None and result["zero_retention_verified"] is False
    )


def test_malformed_output_still_preserves_valid_usage_without_text():
    value = response()
    value["output"][0].pop("status")
    with httpx.Client(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json=value))
    ) as client:
        result = probe(
            client,
            "https://synthetic.invalid/v1/responses",
            "synthetic-key",
            "synthetic-model",
            False,
            False,
        )
    assert (
        result["category"] == "unexpected_output_item"
        and not result["candidate_available"]
    )
    assert (
        result["usage"]["total_tokens"] == 130
        and result["cost_state"] == "usage_observed_unpriced"
    )
    assert result["output_shape"]["items"][0]["status"] == "absent_or_other"
    assert TEXT not in json.dumps(result)


@pytest.mark.parametrize(
    "fault", ["timeout", "disconnect", "invalid_json", "oversize", "wrong_answer"]
)
def test_transport_and_quality_faults(fault):
    def handler(request):
        if fault == "timeout":
            raise httpx.ReadTimeout("secret external error", request=request)
        if fault == "disconnect":
            raise httpx.RemoteProtocolError("secret external error", request=request)
        if fault == "invalid_json":
            return httpx.Response(
                200, headers={"content-type": "application/json"}, content=b"not json"
            )
        if fault == "oversize":
            return httpx.Response(
                200,
                headers={"content-type": "application/json"},
                content=b"x" * (1024 * 1024 + 1),
            )
        value = response()
        value["output"][0]["content"][0]["text"] = (
            '{"answer":"先进先出","source_id":"S2"}'
        )
        return httpx.Response(200, json=value)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = probe(
            client,
            "https://synthetic.invalid/v1/responses",
            "secret_key",
            "synthetic-model",
            False,
            False,
        )
    assert result["candidate_available"] is False
    assert "secret" not in json.dumps(result)


def test_fragmented_multibyte_sse_http_transport():
    class Fragmented(httpx.SyncByteStream):
        def __iter__(self):
            raw = ("\n".join(lines(events())) + "\n").encode()
            for offset in range(0, len(raw), 7):
                yield raw[offset : offset + 7]

    with httpx.Client(
        transport=httpx.MockTransport(
            lambda _: httpx.Response(
                200, headers={"content-type": "text/event-stream"}, stream=Fragmented()
            )
        )
    ) as client:
        result = probe(
            client,
            "https://synthetic.invalid/v1/responses",
            "synthetic-key",
            "synthetic-model",
            True,
            False,
        )
    assert result["synthetic_answer_valid"] and result["candidate_available"]
