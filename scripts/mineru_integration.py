"""Real self-hosted V1 + main API/SQL/Temporal probe; only frozen original PDF fixtures."""

import argparse
import asyncio
import hashlib
import json
import os
import re
import socket
import subprocess
import threading
import time
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Self
from uuid import uuid4

import httpx
from canlearn_workflow.mineru import MineruClient, MineruError
from canlearn_workflow.mineru_probe import MineruProbeWorkflow
from canlearn_workflow.settings import settings
from canlearn_workflow.smoke import SmokeRef
from smoke_runtime import ROOT, RUNTIME, environment, ready, start, stop
from temporalio.client import Client
from temporalio.common import WorkflowIDReusePolicy
from temporalio.worker import Replayer


class LostCreateAck:
    """Loopback-only fault relay. Forward a real POST, deliberately lose its successful reply."""

    def __init__(self, upstream_url: str) -> None:
        self.creates = 0
        self.hidden_job_id: str | None = None
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args: object) -> None:
                pass

            def forward(self) -> None:
                size = int(self.headers.get("content-length", "0"))
                if size > 5 * 1024 * 1024 or not self.path.startswith("/v1/"):
                    self.send_error(413)
                    return
                body = self.rfile.read(size)
                headers = {
                    key: value
                    for key, value in self.headers.items()
                    if key.lower() not in ("host", "connection", "content-length")
                }
                with httpx.Client(timeout=20, trust_env=False) as client:
                    response = client.request(
                        self.command,
                        upstream_url + self.path,
                        headers=headers,
                        content=body,
                    )
                if self.command == "POST" and self.path == "/v1/parse/jobs":
                    owner.creates += 1
                    if response.status_code == 202:
                        owner.hidden_job_id = response.json()["job_id"]
                        self.connection.shutdown(socket.SHUT_RDWR)
                        self.connection.close()
                        return
                self.send_response(response.status_code)
                self.send_header(
                    "content-type",
                    response.headers.get("content-type", "application/octet-stream"),
                )
                self.send_header("content-length", str(len(response.content)))
                self.end_headers()
                self.wfile.write(response.content)

            do_GET = do_POST = do_PUT = do_DELETE = forward

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def __enter__(self) -> Self:
        self.thread.start()
        return self

    def __exit__(self, *args: object) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


async def main(args: argparse.Namespace) -> None:
    assert settings.canlearn_mineru_probe_enabled and settings.canlearn_smoke_enabled
    env = environment()
    original_url = settings.mineru_base_url
    spec = json.loads(args.control_spec.read_text())
    records: list[dict[str, Any]] = []
    jobs: list[dict[str, Any]] = []

    def passed(name: str, condition: bool, job: dict[str, Any] | None = None) -> None:
        assert condition, name
        row: dict[str, Any] = {"name": name, "passed": True}
        if job:
            row.update(
                job_id=job["id"],
                snapshot_id=job["snapshotId"],
                upstream_job_id=job.get("upstreamJobId"),
                status=job["status"],
            )
        records.append(row)
        print(f"PASS {name}", flush=True)

    async def control(name: str) -> dict[str, Any]:
        argv = spec[name]
        if (
            not isinstance(argv, list)
            or not argv
            or not all(isinstance(value, str) for value in argv)
        ):
            raise ValueError("Private control spec requires an explicit argv list")
        result = await asyncio.to_thread(
            subprocess.run,
            argv,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        if result.returncode:
            raise RuntimeError(
                "Isolated upstream control failed; no command or credential echo"
            )
        return dict(json.loads(result.stdout))

    client = await Client.connect(env["TEMPORAL_ADDRESS"])
    async with (
        httpx.AsyncClient(
            base_url="http://127.0.0.1:3311/v1/internal/mineru-probe/",
            headers={"x-smoke-token": env["CANLEARN_SMOKE_TOKEN"]},
            timeout=10,
            trust_env=False,
        ) as api,
        MineruClient(original_url, settings.mineru_api_key) as mineru,
    ):

        async def request(
            method: str, path: str, body: Any = None, status: int = 200
        ) -> dict[str, Any]:
            response = await api.request(method, path, json=body)
            assert response.status_code == status, (
                f"probe HTTP status mismatch: {response.status_code}"
            )
            value: dict[str, Any] = response.json()
            return value

        async def create(
            fixture: str = "reading", seconds: int = 600, key: str | None = None
        ) -> dict[str, Any]:
            value = await request(
                "POST",
                "jobs",
                {
                    "requestKey": key or str(uuid4()),
                    "fixtureId": fixture,
                    "tier": "basic",
                    "pollSeconds": seconds,
                },
                202,
            )
            jobs.append(value)
            return value

        async def launch(job: dict[str, Any]) -> Any:
            return await client.start_workflow(
                MineruProbeWorkflow.run,
                SmokeRef(job["id"], job["snapshotId"], job["epoch"], job["traceId"]),
                id=job["workflowId"],
                task_queue=env["TEMPORAL_TASK_QUEUE"],
                id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
            )

        async def get(job: dict[str, Any]) -> dict[str, Any]:
            return await request("GET", f"jobs/{job['id']}")

        async def wait(
            job: dict[str, Any], predicate: Any, seconds: int = 180
        ) -> dict[str, Any]:
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                row = await get(job)
                if predicate(row):
                    return row
                await asyncio.sleep(0.25)
            raise AssertionError("probe state deadline exhausted")

        try:
            health = await mineru.health()
            passed(
                "genuine fixed-version V1 health and three output capabilities",
                health["version"] == "4.0.7",
            )
            baseline = await control("gpu_sample")
            passed(
                "GPU free-memory guard preserves existing workloads",
                baseline["free_mib"] >= 4096,
            )
            request_key = str(uuid4())
            reading = await create(key=request_key)
            same = await asyncio.gather(
                create(key=request_key.upper()), create(key=request_key)
            )
            passed(
                "same request key including UUID case preserves Job and snapshot",
                all(
                    row["id"] == reading["id"]
                    and row["snapshotId"] == reading["snapshotId"]
                    for row in same
                ),
                reading,
            )
            conflict = await api.post(
                "jobs",
                json={
                    "requestKey": request_key,
                    "fixtureId": "stack",
                    "tier": "basic",
                    "pollSeconds": 600,
                },
            )
            passed(
                "semantic request-key conflict rejected", conflict.status_code == 409
            )
            handle = await launch(reading)
            result = await handle.result()
            reading = await get(reading)
            passed(
                "API → durable Job → Temporal → actual Basic V1 → API receipt",
                result == "SUCCEEDED" and reading["result"]["pageIndices"] == [1, 2],
                reading,
            )
            output = reading["result"]
            passed(
                "three bounded downloads have verified digest/byte references",
                {artifact["format"] for artifact in output["artifacts"]}
                == {"markdown", "middle_json", "structured_content"}
                and all(
                    artifact["bytes"] > 0
                    and re.fullmatch(r"[0-9a-f]{64}", artifact["sha256"])
                    for artifact in output["artifacts"]
                ),
                reading,
            )
            receipt = {
                "snapshotId": reading["snapshotId"],
                "epoch": reading["epoch"],
                **output,
            }
            repeated = await request("POST", f"jobs/{reading['id']}/finish", receipt)
            passed(
                "duplicate parser receipt has no second effect",
                repeated["revision"] == reading["revision"],
                reading,
            )
            mutation = json.loads(json.dumps(receipt))
            mutation["artifacts"][0]["sha256"] = "0" * 64
            passed(
                "conflicting terminal parser receipt rejected",
                (
                    await api.post(f"jobs/{reading['id']}/finish", json=mutation)
                ).status_code
                == 409,
            )
            history = await handle.fetch_history()
            await Replayer(workflows=[MineruProbeWorkflow]).replay_workflow(history)
            passed(
                "real parser workflow history replays and contains no tokens",
                settings.mineru_api_key not in history.to_json()
                and env["CANLEARN_SMOKE_TOKEN"] not in history.to_json(),
            )
            stop("api")
            start("api")
            await asyncio.to_thread(ready, "http://127.0.0.1:3311/v1/health")
            persisted = await get(reading)
            passed(
                "API restart preserves parser snapshot/upstream/result mapping",
                persisted["result"] == reading["result"]
                and persisted["upstreamJobId"] == reading["upstreamJobId"],
                persisted,
            )

            volume = await create("volume300")
            volume_handle = await launch(volume)
            volume = await wait(volume, lambda row: bool(row.get("upstreamJobId")))
            first_upstream = volume["upstreamJobId"]
            stop("worker", hard=True)
            start("worker")
            timed = await create("volume300", 1)
            timed_handle = await launch(timed)
            passed(
                "bounded poll timeout returns without recreating/canceling upstream",
                await timed_handle.result() == "POLL_TIMEOUT",
            )
            timed = await get(timed)
            timed_upstream = timed["upstreamJobId"]
            passed(
                "timed-out Job remains RUNNING with its durable upstream ID",
                timed["status"] == "RUNNING" and timed["phase"] == "poll_timeout",
                timed,
            )
            resumed = await request("POST", f"jobs/{timed['id']}/resume")
            resumed_handle = await launch(resumed)
            passed(
                "explicit resume keeps input snapshot and upstream ID",
                resumed["snapshotId"] == timed["snapshotId"]
                and resumed["upstreamJobId"] == timed_upstream
                and resumed["epoch"] == timed["epoch"] + 1,
                resumed,
            )
            queued = await mineru.get_job(timed_upstream)
            passed(
                "cancellation target is actually queued upstream",
                queued["status"] == "queued",
            )
            cancelled = await request("POST", f"jobs/{timed['id']}/cancel")
            if await resumed_handle.result() == "POLL_TIMEOUT":
                # A timed-out execution ended; a separate explicit stop observer uses only the Job ref.
                await client.start_workflow(
                    MineruProbeWorkflow.run,
                    SmokeRef(
                        cancelled["id"],
                        cancelled["snapshotId"],
                        cancelled["epoch"],
                        cancelled["traceId"],
                    ),
                    id=f"cl-mineru-stop/{cancelled['id']}/{cancelled['epoch']}",
                    task_queue=env["TEMPORAL_TASK_QUEUE"],
                )
            cancelled = await wait(
                cancelled, lambda row: row["terminationState"] == "logical_acknowledged"
            )
            passed(
                "logical cancellation rejects publication and upstream queued task cancels",
                cancelled["status"] == "CANCELLED"
                and cancelled["result"] is None
                and (await mineru.get_job(timed_upstream))["status"] == "canceled",
                cancelled,
            )
            old_receipt = {
                **receipt,
                "snapshotId": timed["snapshotId"],
                "epoch": timed["epoch"],
                "upstreamJobId": timed_upstream,
            }
            passed(
                "controlled late old-epoch receipt is fenced after cancellation",
                (
                    await api.post(f"jobs/{timed['id']}/finish", json=old_receipt)
                ).status_code
                == 409,
            )
            volume_result = await volume_handle.result()
            volume = await get(volume)
            volume_history = await volume_handle.fetch_history()
            attempts = [
                event.activity_task_started_event_attributes.attempt
                for event in volume_history.events
                if event.HasField("activity_task_started_event_attributes")
            ]
            passed(
                "SIGKILL worker resumes original upstream task without new parse creation",
                volume_result == "SUCCEEDED"
                and volume["upstreamJobId"] == first_upstream
                and max(attempts) >= 2,
                volume,
            )
            passed(
                "explicit 1-300 result has complete unique physical page indices",
                volume["result"]["pageIndices"] == list(range(1, 301)),
                volume,
            )
            markdown = next(
                artifact
                for artifact in volume["result"]["artifacts"]
                if artifact["format"] == "markdown"
            )
            text = (
                Path(settings.canlearn_mineru_probe_artifact_dir)
                / volume["id"]
                / f"{markdown['fileId']}.markdown"
            ).read_text()
            anchors = [
                int(value)
                for value in re.findall(r"PAGE[\s_-]*ANCHOR[\s_-]*(\d{3})(?!\d)", text)
            ]
            passed(
                "300 original page anchors survive exactly once; no quality-rate claim",
                sorted(anchors) == list(range(1, 301)),
            )
            await Replayer(workflows=[MineruProbeWorkflow]).replay_workflow(
                volume_history
            )
            passed("recovered actual 300-page workflow history replays", True)

            lost = await create("volume300")
            lost_handle = await launch(lost)
            lost = await wait(lost, lambda row: bool(row.get("upstreamJobId")))
            await control("restart_upstream")
            await asyncio.to_thread(ready, original_url + "/v1/health", 60)
            try:
                await mineru.get_job(lost["upstreamJobId"])
                raise AssertionError(
                    "Old upstream job unexpectedly survived stateless process restart"
                )
            except MineruError as exc:
                passed(
                    "actual MinerU restart loses old V1 resource index",
                    exc.code == "MINERU_RESOURCE_LOST",
                )
            outcome = await lost_handle.result()
            lost = await get(lost)
            if outcome == "POLL_TIMEOUT":
                resumed_lost = await request("POST", f"jobs/{lost['id']}/resume")
                assert await (await launch(resumed_lost)).result() == "FAILED"
                lost = await get(lost)
            passed(
                "platform retains mapping/snapshot and reports UPSTREAM_LOST without recreate",
                lost["status"] == "FAILED"
                and lost["failureCode"] == "UPSTREAM_LOST"
                and lost["result"] is None,
                lost,
            )

            with LostCreateAck(original_url) as relay:
                os.environ["MINERU_BASE_URL"] = relay.url
                stop("worker")
                start("worker")
                uncertain = await create()
                uncertain_handle = await launch(uncertain)
                passed(
                    "successful real upstream POST with lost ACK becomes CREATE_UNKNOWN",
                    await uncertain_handle.result() == "FAILED",
                )
                uncertain = await get(uncertain)
                replayed = await create(key=uncertain["requestKey"])
                passed(
                    "unknown creation is never automatically retried or falsely published",
                    uncertain["failureCode"] == "CREATE_UNKNOWN"
                    and uncertain["phase"] == "create_unknown"
                    and uncertain["result"] is None
                    and replayed["id"] == uncertain["id"]
                    and relay.creates == 1
                    and bool(relay.hidden_job_id),
                    uncertain,
                )
                actual = await mineru.wait(str(relay.hidden_job_id), seconds=60)
                passed(
                    "lost-ACK upstream computation actually completed while platform withheld result",
                    actual["status"] == "completed",
                )
                os.environ["MINERU_BASE_URL"] = original_url
                stop("worker")
                start("worker")
            final_gpu = await control("gpu_sample")
            provenance = await control("provenance")
            # Name this public source digest without a credential-like "api" prefix.
            if "api_server_sha256" in provenance:
                provenance["source_sha256"] = provenance.pop("api_server_sha256")
            passed(
                "fixed remote package source/model hashes verified",
                provenance["versions"]["mineru"] == "4.0.7"
                and provenance["versions"]["docvortex"] == "0.5.16"
                and provenance["model_hashes_verified"],
            )
            args.record.write_text(
                json.dumps(
                    {
                        "recorded_at": datetime.now(UTC).isoformat(),
                        "scope": "original fixtures only; real Basic/GPU V1 through SSH loopback + main API/SQL/Temporal; no production network or human quality acceptance",
                        "passed": len(records),
                        "checks": records,
                        "health": health,
                        "gpu_before": baseline,
                        "gpu_after": final_gpu,
                        "provenance": provenance,
                        "history_sha256": hashlib.sha256(
                            volume_history.to_json().encode()
                        ).hexdigest(),
                        "real_human_quality_verified": False,
                        "external_model_api_cloud_calls": 0,
                        "physical_active_job_stop_verified": False,
                    },
                    indent=2,
                )
                + "\n"
            )
            print(
                f"{len(records)} real parser integration checks passed; sanitized evidence saved",
                flush=True,
            )
        finally:
            os.environ["MINERU_BASE_URL"] = original_url
            for job in jobs:
                row = await get(job)
                if row["status"] in ("QUEUED", "RUNNING"):
                    await request("POST", f"jobs/{row['id']}/cancel")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--control-spec",
        required=True,
        type=Path,
        help="Private argv lists for only your isolated restart/gpu/provenance operations",
    )
    parser.add_argument(
        "--record", type=Path, default=RUNTIME / "mineru-integration-results.json"
    )
    asyncio.run(main(parser.parse_args()))
