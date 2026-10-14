"""Default-off original-fixture Temporal probe; the main API owns all Job/checkpoint facts."""

import asyncio
import hashlib
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path
from typing import Any

from temporalio import activity, workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError

with workflow.unsafe.imports_passed_through():
    import httpx

    from canlearn_workflow.mineru import FORMATS, MineruClient, MineruError
    from canlearn_workflow.settings import settings
    from canlearn_workflow.smoke import SmokeApi, SmokeRef

ROOT: Path = Path(__file__).parents[4]


@asynccontextmanager
async def heartbeat_scope(ref: SmokeRef) -> AsyncIterator[None]:
    async def pulse() -> None:
        while True:
            activity.heartbeat({"job_id": ref.job_id, "snapshot_id": ref.snapshot_id})
            await asyncio.sleep(1)

    task = asyncio.create_task(pulse())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


class ProbeApi(SmokeApi):
    def __init__(self) -> None:
        super().__init__()
        if not settings.canlearn_mineru_probe_enabled:
            raise RuntimeError("Explicit local MinerU probe flag required")
        self.client.base_url = httpx.URL(
            settings.api_internal_url.rstrip("/") + "/internal/mineru-probe/"
        )

    async def __aenter__(self) -> "ProbeApi":
        return self


def source_fixture(input: dict[str, Any]) -> Path:
    registry = json.loads((ROOT / "contracts/fixtures/mineru-probe.v1.json").read_text())[
        "fixtures"
    ]
    fixture = registry.get(input.get("fixtureId"))
    if (
        not fixture
        or fixture["sha256"] != input.get("sha256")
        or fixture["pages"] != input.get("pages")
    ):
        raise MineruError("MINERU_FIXTURE_HASH_MISMATCH")
    path: Path = (ROOT / str(fixture["path"])).resolve()
    if (
        not path.is_relative_to(ROOT / "docs")
        or hashlib.sha256(path.read_bytes()).hexdigest() != fixture["sha256"]
    ):
        raise MineruError("MINERU_FIXTURE_HASH_MISMATCH")
    return path


def page_indices(path: Path, expected: int) -> list[int]:
    value = json.loads(path.read_text())
    if (
        value.get("schema") != "docvortex.middle"
        or value.get("schema_version") != "2.0"
        or value.get("metadata", {}).get("producer", {}) != {"name": "mineru", "version": "4.0.7"}
    ):
        raise MineruError("MINERU_ARTIFACT_SCHEMA_MISMATCH")
    pages = value.get("pages")
    if not isinstance(pages, list) or not pages:
        raise MineruError("MINERU_PAGE_COVERAGE_INVALID")
    result = []
    for page in pages:
        index = page.get("page_idx") if isinstance(page, dict) else None
        if type(index) is not int or not 0 <= index < expected:
            raise MineruError("MINERU_PAGE_COVERAGE_INVALID")
        result.append(index + 1)
    if len(set(result)) != len(result):
        raise MineruError("MINERU_PAGE_COVERAGE_INVALID")
    return sorted(result)


async def _stop(api: ProbeApi, mineru: MineruClient, job: dict[str, Any]) -> str:
    state = "unknown"
    if job.get("upstreamJobId"):
        try:
            await mineru.cancel(job["upstreamJobId"])
            state = "logical_acknowledged"
        except MineruError:
            pass
    elif job["phase"] in ("new", "source_ready"):
        state = "logical_acknowledged"  # No parse creation was admitted.
    await api.request(
        "POST",
        f"jobs/{job['id']}/stopped",
        {"snapshotId": job["snapshotId"], "epoch": job["epoch"], "terminationState": state},
    )
    return "CANCELLED"


@activity.defn
async def run_mineru_probe(ref: SmokeRef) -> str:
    async with (
        heartbeat_scope(ref),
        ProbeApi() as api,
        MineruClient(settings.mineru_base_url, settings.mineru_api_key) as mineru,
    ):

        async def current() -> dict[str, Any]:
            activity.heartbeat({"job_id": ref.job_id, "snapshot_id": ref.snapshot_id})
            return await api.request("GET", f"jobs/{ref.job_id}")

        async def checkpoint(job: dict[str, Any], phase: str, **values: Any) -> dict[str, Any]:
            return await api.request(
                "POST",
                f"jobs/{ref.job_id}/checkpoint",
                {**ref.callback(), "revision": job["revision"], "phase": phase, **values},
            )

        job = await current()
        if job["status"] == "CANCELLED":
            return await _stop(api, mineru, job)
        if job["status"] in ("SUCCEEDED", "PARTIAL_READY", "FAILED"):
            return str(job["status"])
        job = await api.request("POST", f"jobs/{ref.job_id}/start", ref.callback())
        if job["phase"] == "poll_timeout":
            return (
                "POLL_TIMEOUT"  # Resumption requires a fresh API epoch and explicit workflow start.
            )
        input = job["input"]
        try:
            await mineru.health()
            if job["phase"] == "new":
                file_id = await mineru.upload(source_fixture(input), input["sha256"])
                job = await checkpoint(job, "source_ready", fileId=file_id)
            if job["phase"] == "source_ready":
                # Persist uncertainty before POST. Retries never repeat parse creation.
                job = await checkpoint(job, "create_pending")
                latest = await current()
                if latest["status"] == "CANCELLED":
                    return await _stop(api, mineru, latest)
                try:
                    upstream = await mineru.create_job(job["fileId"], input["pages"], input["tier"])
                except MineruError:
                    latest = await current()
                    if latest["status"] == "CANCELLED":
                        return await _stop(api, mineru, latest)
                    await checkpoint(latest, "create_unknown", failureCode="CREATE_UNKNOWN")
                    return "FAILED"
                try:
                    job = await checkpoint(job, "submitted", upstreamJobId=upstream["job_id"])
                except ApplicationError:
                    latest = await current()
                    if latest["status"] == "CANCELLED":
                        # The create/cancel race does not publish a result; retain stop uncertainty.
                        try:
                            await mineru.cancel(upstream["job_id"])
                        except MineruError:
                            pass
                        return await _stop(api, mineru, latest)
                    raise
            elif job["phase"] == "create_pending":
                await checkpoint(job, "create_unknown", failureCode="CREATE_UNKNOWN")
                return "FAILED"
            deadline = asyncio.get_running_loop().time() + input["pollSeconds"]
            while True:
                job = await current()
                if job["status"] == "CANCELLED":
                    return await _stop(api, mineru, job)
                if job["status"] in ("SUCCEEDED", "PARTIAL_READY", "FAILED"):
                    return str(job["status"])
                upstream = await mineru.get_job(job["upstreamJobId"])
                if upstream["status"] in ("failed", "canceled"):
                    await checkpoint(job, "failed", failureCode="UPSTREAM_FAILED")
                    return "FAILED"
                if upstream["status"] in ("completed", "partial"):
                    break
                if asyncio.get_running_loop().time() >= deadline:
                    await checkpoint(job, "poll_timeout")
                    return "POLL_TIMEOUT"  # Job remains RUNNING with the same upstream reference.
                await asyncio.sleep(0.25)
            file = upstream["files"][0]
            if (
                file.get("file_id") != job["fileId"]
                or file.get("page_range") != input["pageRange"]
                or file.get("status") != "completed"
                or file.get("parse", {}).get("parser_version") != "4.0.7"
            ):
                raise MineruError("MINERU_PROTOCOL_INVALID")
            folder = Path(settings.canlearn_mineru_probe_artifact_dir) / ref.job_id
            artifacts = []
            for format in FORMATS:
                output = file.get("output_files", {}).get(format, {})
                artifact = await mineru.download(output.get("file_id"), format, folder)
                artifacts.append(artifact.receipt())
            middle = next(artifact for artifact in artifacts if artifact["format"] == "middle_json")
            indices = page_indices(folder / f"{middle['fileId']}.middle_json", input["pages"])
            completed = await api.request(
                "POST",
                f"jobs/{ref.job_id}/finish",
                {
                    **ref.callback(),
                    "upstreamJobId": job["upstreamJobId"],
                    "parserVersion": "4.0.7",
                    "pageIndices": indices,
                    "artifacts": artifacts,
                },
            )
            return str(completed["status"])
        except MineruError as exc:
            job = await current()
            if job["status"] == "CANCELLED":
                return await _stop(api, mineru, job)
            if job["status"] in ("SUCCEEDED", "PARTIAL_READY", "FAILED"):
                return str(job["status"])
            lost = exc.code == "MINERU_RESOURCE_LOST" and bool(job.get("upstreamJobId"))
            if exc.code == "MINERU_TRANSPORT_UNKNOWN" and job.get("upstreamJobId"):
                if job["phase"] != "poll_timeout":
                    await checkpoint(job, "poll_timeout")
                return "POLL_TIMEOUT"
            await checkpoint(
                job,
                "upstream_lost" if lost else "failed",
                failureCode="UPSTREAM_LOST" if lost else "PROTOCOL_INVALID",
            )
            return "FAILED"
        except ApplicationError:
            job = await current()
            if job["status"] == "CANCELLED":
                return await _stop(api, mineru, job)
            raise


@workflow.defn
class MineruProbeWorkflow:
    @workflow.run
    async def run(self, ref: SmokeRef) -> str:
        return await workflow.execute_activity(
            run_mineru_probe,
            ref,
            start_to_close_timeout=timedelta(seconds=720),
            schedule_to_close_timeout=timedelta(seconds=1500),
            heartbeat_timeout=timedelta(seconds=15),
            retry_policy=RetryPolicy(maximum_attempts=2, initial_interval=timedelta(seconds=1)),
        )
