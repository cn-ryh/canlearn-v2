"""Fault checks for the isolated business-chain experiment; never call the platform."""

import json
from pathlib import Path

import business_chain_probe as probe
import httpx
import pytest
from openai import OpenAI


def candidate():
    return {
        "status": "ready",
        "questions": [
            {
                "id": f"Q{i + 1:02}",
                "stem": f"根据当前有效资料计算{task[0]}。",
                "answer": task[1],
                "source_ids": task[2][:],
            }
            for i, task in enumerate(probe.TASKS)
        ],
        "missing_source_ids": [],
    }


@pytest.mark.parametrize(
    "mutation,reason",
    [("withdrawn", "citation"), ("wrong_answer", "answer"), ("duplicate_id", "format")],
)
def test_candidate_corruption_is_rejected(mutation, reason):
    value = candidate()
    if mutation == "withdrawn":
        value["questions"][0]["source_ids"][0] = "S1-v1"
    elif mutation == "wrong_answer":
        value["questions"][0]["answer"] = 46
    else:
        value["questions"][1]["id"] = "Q01"
    assert reason in probe.grade(value, "version_conflict")["reason_codes"]


def test_no_answer_cannot_generate_unsupported_price():
    assert probe.grade(
        {
            "status": "insufficient_evidence",
            "questions": [],
            "missing_source_ids": ["S6-v1"],
        },
        "no_answer",
    )["valid"]
    assert not probe.grade(candidate(), "no_answer")["valid"]


def test_cross_model_verdict_does_not_override_local_failure():
    local = probe.grade(None, "version_conflict")
    assert not probe.check_agrees(
        {"accepted": True, "invalid_question_ids": [], "reason_codes": []}, local
    )


@pytest.mark.parametrize(
    "fault",
    [
        "partial",
        "mismatch",
        "failed",
        "incomplete",
        "http503",
        "intentional_close",
        "timeout",
    ],
)
def test_stream_fault_never_becomes_candidate(tmp_path, fault):
    requests = []
    text = json.dumps(candidate())
    wire = {
        "id": "resp_synthetic",
        "object": "response",
        "created_at": 0,
        "model": "step-5-preview",
        "status": "completed",
        "output": [
            {
                "id": "msg_synthetic",
                "type": "message",
                "role": "assistant",
                "status": "completed",
                "content": [{"type": "output_text", "text": text, "annotations": []}],
            }
        ],
        "usage": {"input_tokens": 12, "output_tokens": 24, "total_tokens": 36},
    }

    def transport(request):
        requests.append(request)
        if fault == "http503":
            return httpx.Response(
                503, json={"error": {"message": "synthetic", "type": "unavailable"}}
            )
        if fault == "timeout":
            raise httpx.ReadTimeout("synthetic", request=request)
        delta = "incorrect delta" if fault == "mismatch" else text
        events = [
            {
                "type": "response.output_text.delta",
                "delta": delta,
                "item_id": "msg_synthetic",
                "output_index": 0,
                "content_index": 0,
            }
        ]
        if fault != "partial":
            if fault in {"failed", "incomplete"}:
                wire["status"] = fault
            events.append({"type": f"response.{wire['status']}", "response": wire})
        return httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            text="".join(
                "data: " + json.dumps({**event, "sequence_number": i}) + "\n\n"
                for i, event in enumerate(events)
            ),
        )

    rates = json.loads(Path(probe.__file__).with_name("quoted-rates.json").read_text())
    report = {"runs": []}
    with (
        httpx.Client(transport=httpx.MockTransport(transport)) as http,
        OpenAI(
            base_url="https://synthetic.invalid/v1",
            api_key="synthetic-key",
            max_retries=0,
            http_client=http,
        ) as client,
    ):
        runner = probe.Runner(client, rates, report, tmp_path / "out.json")
        value, row = runner.call(
            "step-5-preview",
            "offline",
            "version_conflict",
            "synthetic",
            probe.GEN_SCHEMA,
            abort=fault == "intentional_close",
        )
    assert len(requests) == 1 and value is None and not row["transport_valid"]
    assert len(report["runs"]) == 1
    if fault in {"mismatch", "failed", "incomplete"}:
        assert row["usage"]["total_tokens"] == 36
    else:
        assert row["usage"] is None


def test_quote_budget_denies_before_network(tmp_path):
    class NeverCalled:
        @property
        def responses(self):
            raise AssertionError("network client called after budget denial")

    rates = json.loads(Path(probe.__file__).with_name("quoted-rates.json").read_text())
    runner = probe.Runner(NeverCalled(), rates, {"runs": []}, tmp_path / "out.json")
    runner.reserved = probe.QUOTE_BUDGET
    with pytest.raises(RuntimeError, match="experiment_admission_limit"):
        runner.call(
            "step-5-preview",
            "offline",
            "version_conflict",
            "synthetic",
            probe.GEN_SCHEMA,
        )
