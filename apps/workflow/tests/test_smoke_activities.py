"""Activity HTTP boundary tests; real Temporal restart/replay is in smoke_integration.py."""

import json

import httpx
import pytest
from temporalio.testing import ActivityEnvironment

from canlearn_workflow.settings import settings
from canlearn_workflow.smoke import SmokeApi, SmokeRef, manifest, run_smoke_job

REF = SmokeRef(
    "01300000-0000-4000-8000-000000000001",
    "01300000-0000-4000-8000-000000000002",
    1,
    "0123456789abcdef0123456789abcdef",
)


@pytest.fixture
def local_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "canlearn_smoke_enabled", True)
    monkeypatch.setattr(
        settings, "canlearn_smoke_token", "synthetic-activity-test-credential-0000000"
    )
    monkeypatch.setattr(settings, "api_internal_url", "http://127.0.0.1:3311/v1")


@pytest.mark.parametrize(
    "mode,status",
    [
        ("success", "SUCCEEDED"),
        ("partial", "PARTIAL_READY"),
        ("blank", "SUCCEEDED"),
        ("fail", "FAILED"),
    ],
)
async def test_activity_submits_only_fixed_manifest(
    monkeypatch: pytest.MonkeyPatch, local_settings: None, mode: str, status: str
) -> None:
    calls: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.url.host == "127.0.0.1"
        assert request.headers["x-smoke-token"] == settings.canlearn_smoke_token
        if request.url.path.endswith("/start"):
            assert json.loads(request.content) == REF.callback()
            return httpx.Response(
                200, json={"status": "RUNNING", "input": {"mode": mode, "delayMs": 0}}
            )
        assert request.url.path.endswith("/finish")
        assert json.loads(request.content) == {**REF.callback(), "pages": manifest(mode)}
        return httpx.Response(200, json={"status": status})

    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(handle)),
    )
    assert await ActivityEnvironment().run(run_smoke_job, REF) == status
    assert len(calls) == 2


async def test_cancelled_admission_never_computes_or_finishes(
    monkeypatch: pytest.MonkeyPatch, local_settings: None
) -> None:
    calls: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.url.path.endswith("/start")
        return httpx.Response(200, json={"status": "CANCELLED", "input": None})

    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(handle)),
    )
    assert await ActivityEnvironment().run(run_smoke_job, REF) == "CANCELLED"
    assert len(calls) == 1


@pytest.mark.parametrize("url", ["http://192.0.2.1/v1", "https://model.invalid/v1"])
def test_smoke_transport_refuses_external_services(
    monkeypatch: pytest.MonkeyPatch, local_settings: None, url: str
) -> None:
    monkeypatch.setattr(settings, "api_internal_url", url)
    with pytest.raises(RuntimeError, match="loopback"):
        SmokeApi()
