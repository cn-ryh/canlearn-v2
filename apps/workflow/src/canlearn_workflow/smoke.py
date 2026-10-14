"""Local CL-013a synthetic computation. No document, model or GPU service is called."""

import asyncio
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from urllib.parse import urlparse

from temporalio import activity, workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError, ApplicationError

with workflow.unsafe.imports_passed_through():
    import httpx

    from canlearn_workflow.settings import settings


@dataclass
class SmokeRef:
    job_id: str
    snapshot_id: str
    epoch: int
    trace_id: str

    def callback(self) -> dict[str, Any]:
        return {"snapshotId": self.snapshot_id, "epoch": self.epoch}


class SmokeApi:
    def __init__(self) -> None:
        parsed = urlparse(settings.api_internal_url)
        if not settings.canlearn_smoke_enabled or len(settings.canlearn_smoke_token) < 32:
            raise RuntimeError("Local smoke mode and a service token are required")
        if parsed.hostname not in ("127.0.0.1", "localhost", "::1") or parsed.scheme != "http":
            raise RuntimeError("Smoke API must be an HTTP loopback URL")
        self.client = httpx.AsyncClient(
            base_url=settings.api_internal_url.rstrip("/") + "/internal/smoke/",
            headers={"x-smoke-token": settings.canlearn_smoke_token},
            timeout=3,
            trust_env=False,  # Local transport only; no outbound provider is accessed.
        )

    async def __aenter__(self) -> "SmokeApi":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.client.aclose()

    async def request(self, method: str, path: str, body: Any = None) -> dict[str, Any]:
        response = await self.client.request(method, path, json=body)
        if response.status_code in (400, 403, 404, 409):
            raise ApplicationError("SMOKE_CALLBACK_REJECTED", non_retryable=True)
        response.raise_for_status()
        result: dict[str, Any] = response.json()
        return result


def manifest(mode: str) -> list[dict[str, Any]]:
    statuses = {
        "success": ["success", "success", "success"],
        "partial": ["success", "failed", "missing"],
        "blank": ["blank", "blank", "blank"],
        "fail": ["failed", "failed", "failed"],
    }
    return [{"pageIndex": index + 1, "status": value} for index, value in enumerate(statuses[mode])]


@activity.defn
async def run_smoke_job(ref: SmokeRef) -> str:
    async with SmokeApi() as api:
        job = await api.request("POST", f"jobs/{ref.job_id}/start", ref.callback())
        if job["status"] != "RUNNING":
            return str(job["status"])
        config = job["input"]
        remaining = config["delayMs"] / 1000
        while remaining > 0:
            activity.heartbeat({"job_id": ref.job_id, "snapshot_id": ref.snapshot_id})
            interval = min(remaining, 0.25)
            await asyncio.sleep(interval)
            remaining -= interval
            current = await api.request("GET", f"jobs/{ref.job_id}")
            if current["status"] == "CANCELLED":
                return "CANCELLED"
        # Callback is idempotent. Re-executing this bounded synthetic activity is free.
        try:
            completed = await api.request(
                "POST",
                f"jobs/{ref.job_id}/finish",
                {**ref.callback(), "pages": manifest(config["mode"])},
            )
        except ApplicationError:
            current = await api.request("GET", f"jobs/{ref.job_id}")
            if current["status"] == "CANCELLED":
                return "CANCELLED"
            raise
        return str(completed["status"])


@activity.defn
async def confirm_smoke_stop(job_id: str) -> str:
    async with SmokeApi() as api:
        await api.request("POST", f"jobs/{job_id}/stopped")
    return "CANCELLED"


@activity.defn
async def abandon_smoke_job(ref: SmokeRef) -> str:
    async with SmokeApi() as api:
        job = await api.request("POST", f"jobs/{ref.job_id}/abandon", ref.callback())
    return str(job["status"])


@workflow.defn
class SyntheticJobWorkflow:
    def __init__(self) -> None:
        self.cancelled = False
        self.ref: SmokeRef | None = None

    @workflow.signal
    def cancel_requested(self, request: dict[str, Any]) -> None:
        if (
            self.ref
            and request.get("job_id") == self.ref.job_id
            and request.get("epoch", 0) > self.ref.epoch
        ):
            self.cancelled = True

    @workflow.run
    async def run(self, ref: SmokeRef) -> str:
        self.ref = ref
        execution = workflow.start_activity(
            run_smoke_job,
            ref,
            start_to_close_timeout=timedelta(seconds=30),
            schedule_to_close_timeout=timedelta(seconds=90),
            heartbeat_timeout=timedelta(seconds=3),
            cancellation_type=workflow.ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
            retry_policy=RetryPolicy(maximum_attempts=3, initial_interval=timedelta(seconds=1)),
        )
        await workflow.wait_condition(lambda: self.cancelled or execution.done())
        if self.cancelled:
            execution.cancel()
            try:
                await execution
            except (ActivityError, asyncio.CancelledError):
                pass
            result = "CANCELLED"
        else:
            try:
                result = await execution
            except ActivityError:
                result = await workflow.execute_activity(
                    abandon_smoke_job,
                    ref,
                    start_to_close_timeout=timedelta(seconds=5),
                    schedule_to_close_timeout=timedelta(seconds=30),
                    retry_policy=RetryPolicy(maximum_attempts=3),
                )
        if result == "CANCELLED":
            return await workflow.execute_activity(
                confirm_smoke_stop,
                ref.job_id,
                start_to_close_timeout=timedelta(seconds=5),
                schedule_to_close_timeout=timedelta(seconds=30),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )
        return result
