"""Execute real loopback HTTP/PostgreSQL/Temporal fault checks; archive only synthetic references."""

import asyncio
import hashlib
import json
import os
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
from canlearn_workflow.smoke import SmokeRef, SyntheticJobWorkflow
from smoke_runtime import ROOT, RUNTIME, down, environment, ready, start, stop, up
from temporalio.client import Client
from temporalio.worker import Replayer

RECORDS: list[dict[str, Any]] = []
JOB_IDS: list[str] = []
HTTP_OBSERVATIONS: list[dict[str, Any]] = []


async def observe_http(response: httpx.Response) -> None:
    if response.request.url.path.startswith("/v1/smoke/jobs"):
        await response.aread()
        # Only fixed synthetic public responses; never capture internal credentials/headers.
        HTTP_OBSERVATIONS.append(
            {
                "path": response.request.url.path,
                "method": response.request.method,
                "status": response.status_code,
                "contentType": response.headers.get("content-type", ""),
                "body": response.json(),
            }
        )


def contract_cli(script: str, path: Path, rejected: bool = False) -> str:
    result = subprocess.run(
        [
            "pnpm",
            "--filter",
            "@canlearn/api",
            "exec",
            "tsx",
            f"src/smoke/{script}.ts",
            str(path),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert (result.returncode != 0) if rejected else (result.returncode == 0), (
        f"{script} gate exit mismatch"
    )
    return result.stdout


def manifest(mode: str) -> list[dict[str, Any]]:
    # Test truth is independent of both the API fixture gate and worker implementation.
    states = {
        "success": ("success", "success", "success"),
        "partial": ("success", "failed", "missing"),
        "blank": ("blank", "blank", "blank"),
        "fail": ("failed", "failed", "failed"),
    }
    return [
        {"pageIndex": page, "status": state}
        for page, state in enumerate(states[mode], 1)
    ]


def record(name: str, condition: bool, job: dict[str, Any] | None = None) -> None:
    assert condition, name
    row: dict[str, Any] = {"name": name, "passed": True}
    if job:
        row.update(
            job_id=job["id"],
            trace_id=job["traceId"],
            snapshot_id=job["snapshotId"],
            status=job["status"],
        )
    RECORDS.append(row)
    print(f"PASS {name}", flush=True)


def sql(query: str) -> list[dict[str, Any]]:
    output = subprocess.check_output(
        [
            "docker",
            "--host=unix:///var/run/docker.sock",
            "exec",
            "canlearn-cl013-postgres-1",
            "psql",
            "-U",
            "canlearn",
            "-d",
            "canlearn",
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            f"select coalesce(json_agg(t),'[]'::json) from ({query}) t",
        ],
        text=True,
    )
    return json.loads(output)


def mutate(query: str) -> None:
    subprocess.run(
        [
            "docker",
            "--host=unix:///var/run/docker.sock",
            "exec",
            "canlearn-cl013-postgres-1",
            "psql",
            "-U",
            "canlearn",
            "-d",
            "canlearn",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            query,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )


async def main() -> None:
    env = environment()
    async with (
        httpx.AsyncClient(
            base_url="http://127.0.0.1:3311/v1",
            timeout=10,
            trust_env=False,
            event_hooks={"response": [observe_http]},
        ) as api,
        httpx.AsyncClient(
            base_url="http://127.0.0.1:3310", timeout=10, trust_env=False
        ) as web,
    ):
        client = await Client.connect(env["TEMPORAL_ADDRESS"])
        marker = {"x-smoke-client": "1"}
        service = {"x-smoke-token": env["CANLEARN_SMOKE_TOKEN"]}
        origin = {"origin": "http://127.0.0.1:3310"}

        async def create(
            mode: str = "success",
            delay: int = 500,
            key: str | None = None,
            via_web: bool = False,
        ) -> dict[str, Any]:
            key = key or str(uuid4())
            response = await (web if via_web else api).post(
                "/api/smoke" if via_web else "/smoke/jobs",
                json={"mode": mode, "delayMs": delay},
                headers={**(origin if via_web else marker), "idempotency-key": key},
            )
            assert response.status_code == 202, (
                f"create returned {response.status_code}"
            )
            job: dict[str, Any] = response.json()
            JOB_IDS.append(job["id"])
            return job

        async def current(job: dict[str, Any]) -> dict[str, Any]:
            response = await api.get(f"/smoke/jobs/{job['id']}")
            assert response.status_code == 200
            result: dict[str, Any] = response.json()
            return result

        async def wait(
            job: dict[str, Any], status: str, stopped: bool = False
        ) -> dict[str, Any]:
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                result = await current(job)
                if result["status"] == status and (
                    not stopped or result["terminationState"] == "confirmed"
                ):
                    return result
                await asyncio.sleep(0.25)
            raise AssertionError(f"Job {job['id']} did not reach {status}")

        def ref(job: dict[str, Any]) -> dict[str, Any]:
            return {"snapshotId": job["snapshotId"], "epoch": job["epoch"]}

        record("compiled Web smoke page", (await web.get("/smoke")).status_code == 200)
        # Exercise every public status reachable from a loopback socket, including capacity 503.
        unknown = str(uuid4())
        for method, path, headers, expected in (
            ("GET", "/smoke/jobs/not-a-uuid", {}, 400),
            ("GET", f"/smoke/jobs/{unknown}", {}, 404),
            ("POST", "/smoke/jobs/not-a-uuid/cancel", marker, 400),
            ("POST", f"/smoke/jobs/{unknown}/cancel", marker, 404),
            ("POST", f"/smoke/jobs/{unknown}/cancel", {}, 403),
            ("POST", "/smoke/jobs", {}, 403),
        ):
            response = await api.request(method, path, headers=headers)
            assert response.status_code == expected
        stop("dispatcher")
        capacity_jobs = [await create(delay=0) for _ in range(10)]
        capacity = await api.post(
            "/smoke/jobs",
            json={"mode": "success", "delayMs": 0},
            headers={**marker, "idempotency-key": str(uuid4())},
        )
        record(
            "real capacity admission returns documented 503",
            capacity.status_code == 503,
        )
        for job in capacity_jobs:
            assert (
                await api.post(f"/smoke/jobs/{job['id']}/cancel", headers=marker)
            ).status_code == 200
        start("dispatcher")
        success_key = str(uuid4())
        success = await create(key=success_key, via_web=True)
        record(
            "Web proxy → real API → durable QUEUED",
            success["status"] == "QUEUED",
            success,
        )
        duplicates = await asyncio.gather(
            *(create(key=success_key, via_web=True) for _ in range(8))
        )
        record(
            "eight concurrent requests preserve one Job/snapshot",
            all(
                j["id"] == success["id"] and j["snapshotId"] == success["snapshotId"]
                for j in duplicates
            ),
            success,
        )
        conflict = await web.post(
            "/api/smoke",
            json={"mode": "fail", "delayMs": 500},
            headers={**origin, "idempotency-key": success_key},
        )
        record(
            "same key/different semantic payload rejected", conflict.status_code == 409
        )
        api_conflict = await api.post(
            "/smoke/jobs",
            json={"mode": "fail", "delayMs": 500},
            headers={**marker, "idempotency-key": success_key},
        )
        assert api_conflict.status_code == 409
        for name, response in [
            (
                "arbitrary content rejected",
                await api.post(
                    "/smoke/jobs",
                    json={
                        "mode": "success",
                        "delayMs": 0,
                        "rawText": "synthetic forbidden field",
                    },
                    headers={**marker, "idempotency-key": str(uuid4())},
                ),
            ),
            (
                "foreign Web Origin rejected",
                await web.post(
                    "/api/smoke",
                    json={"mode": "success", "delayMs": 0},
                    headers={"origin": "https://untrusted.invalid"},
                ),
            ),
            (
                "internal callback without service credential rejected",
                await api.post("/internal/smoke/outbox/claim"),
            ),
        ]:
            record(
                name,
                response.status_code == (400 if name.startswith("arbitrary") else 403),
            )
        success = await wait(success, "SUCCEEDED")
        record(
            "real Temporal/worker completes three-page fixture",
            success["result"]["pages"] == manifest("success"),
            success,
        )
        terminal = await api.post(f"/smoke/jobs/{success['id']}/cancel", headers=marker)
        record(
            "completed Job remains immutable on cancellation",
            terminal.json()["status"] == "SUCCEEDED"
            and terminal.json()["revision"] == success["revision"],
            success,
        )
        receipt = {**ref(success), "pages": manifest("success")}
        repeated = await api.post(
            f"/internal/smoke/jobs/{success['id']}/finish",
            json=receipt,
            headers=service,
        )
        record(
            "duplicate completion receipt produces no second effect",
            repeated.status_code == 200
            and repeated.json()["revision"] == success["revision"],
            success,
        )
        invalid = await api.post(
            f"/internal/smoke/jobs/{success['id']}/finish",
            json={**ref(success), "pages": manifest("partial")},
            headers=service,
        )
        record("conflicting manifest rejected", invalid.status_code == 409)

        for mode, expected in (
            ("partial", "PARTIAL_READY"),
            ("blank", "SUCCEEDED"),
            ("fail", "FAILED"),
        ):
            job = await wait(await create(mode), expected)
            record(
                f"{mode} fixture reaches {expected} with exact page coverage",
                job["result"]["pages"] == manifest(mode),
                job,
            )

        cancelled = await create(delay=10000)
        await wait(cancelled, "RUNNING")
        response = await web.post(
            f"/api/smoke/{cancelled['id']}/cancel", headers=origin
        )
        record(
            "Web cancellation commits logical CANCELLED",
            response.status_code == 200 and response.json()["status"] == "CANCELLED",
            response.json(),
        )
        cancelled = await wait(cancelled, "CANCELLED", stopped=True)
        record(
            "synthetic computation stop confirmed by worker",
            cancelled["result"] is None,
            cancelled,
        )
        late = await api.post(
            f"/internal/smoke/jobs/{cancelled['id']}/finish",
            json={
                "snapshotId": cancelled["snapshotId"],
                "epoch": 1,
                "pages": manifest("success"),
            },
            headers=service,
        )
        record("late pre-cancellation completion rejected", late.status_code == 409)
        again = await api.post(f"/smoke/jobs/{cancelled['id']}/cancel", headers=marker)
        record(
            "repeat cancellation preserves epoch/revision",
            again.json()["epoch"] == cancelled["epoch"]
            and again.json()["revision"] == cancelled["revision"],
            cancelled,
        )

        recovering = await create(delay=5000)
        await wait(recovering, "RUNNING")
        stop("worker", hard=True)
        await asyncio.sleep(1)
        start("worker")
        recovered = await wait(recovering, "SUCCEEDED")
        history = await client.get_workflow_handle(
            recovered["workflowId"]
        ).fetch_history()
        attempts = [
            event.activity_task_started_event_attributes.attempt
            for event in history.events
            if event.HasField("activity_task_started_event_attributes")
        ]
        record(
            "SIGKILL worker → heartbeat timeout → activity retry",
            max(attempts) >= 2 and recovered["snapshotId"] == recovering["snapshotId"],
            recovered,
        )
        await Replayer(workflows=[SyntheticJobWorkflow]).replay_workflow(history)
        record(
            "completed real workflow history replays deterministically", True, recovered
        )

        stop("dispatcher")
        pending_key = str(uuid4())
        pending = await create(key=pending_key)
        stop("api")
        start("api")
        await asyncio.to_thread(ready, "http://127.0.0.1:3311/v1/health")
        record(
            "API restart preserves QUEUED Job and Outbox",
            (await current(pending))["status"] == "QUEUED",
            pending,
        )
        duplicate = await create(key=pending_key)
        record(
            "request key survives API restart",
            duplicate["id"] == pending["id"],
            duplicate,
        )

        # Start accepted event, deliberately omit DB ACK, then recover after lease expiry.
        claimed = (
            await api.post("/internal/smoke/outbox/claim", headers=service)
        ).json()["delivery"]
        while claimed and claimed["event"]["event_type"] != "job.accepted.v1":
            await api.post(
                f"/internal/smoke/outbox/{claimed['eventId']}/ack",
                json={"claimToken": claimed["claimToken"]},
                headers=service,
            )
            claimed = (
                await api.post("/internal/smoke/outbox/claim", headers=service)
            ).json()["delivery"]
        assert claimed and claimed["jobId"] == pending["id"]
        snapshot = SmokeRef(pending["id"], pending["snapshotId"], 1, pending["traceId"])
        handle = await client.start_workflow(
            SyntheticJobWorkflow.run,
            snapshot,
            id=pending["workflowId"],
            task_queue=env["TEMPORAL_TASK_QUEUE"],
        )
        initial_run = handle.result_run_id
        await asyncio.sleep(10.5)
        expired = await api.post(
            f"/internal/smoke/outbox/{claimed['eventId']}/ack",
            json={"claimToken": claimed["claimToken"], "runId": initial_run},
            headers=service,
        )
        record("expired dispatcher claim cannot commit ACK", expired.status_code == 409)
        start("dispatcher")
        await wait(pending, "SUCCEEDED")
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            rows = sql(f"select run_id from smoke_jobs where job_id='{pending['id']}'")
            if rows[0]["run_id"]:
                break
            await asyncio.sleep(0.25)
        record(
            "lost start ACK reconciles the original Temporal run",
            rows[0]["run_id"] == initial_run,
            pending,
        )

        # API result+terminal+Outbox rollback at a real PostgreSQL injection point.
        stop("dispatcher")
        rollback = await create(delay=0)
        await api.post(
            f"/internal/smoke/jobs/{rollback['id']}/start",
            json=ref(rollback),
            headers=service,
        )
        mutate(
            f"""CREATE FUNCTION smoke_test_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.job_id='{rollback["id"]}' AND NEW.event->>'event_type'='job.finalized.v1' THEN RAISE EXCEPTION 'SMOKE_INJECTED_ROLLBACK'; END IF; RETURN NEW; END $$; CREATE TRIGGER smoke_test_reject_event BEFORE INSERT ON smoke_outbox FOR EACH ROW EXECUTE FUNCTION smoke_test_reject_event();"""
        )
        try:
            fault = await api.post(
                f"/internal/smoke/jobs/{rollback['id']}/finish",
                json={**ref(rollback), "pages": manifest("success")},
                headers=service,
            )
            after = await current(rollback)
            count = sql(
                f"select count(*)::int as count from smoke_outbox where job_id='{rollback['id']}'"
            )[0]["count"]
            record(
                "SQL failure rolls back result/terminal/finalized event together",
                fault.status_code == 500
                and after["status"] == "RUNNING"
                and after["result"] is None
                and count == 1,
                after,
            )
        finally:
            mutate(
                "DROP TRIGGER smoke_test_reject_event ON smoke_outbox; DROP FUNCTION smoke_test_reject_event();"
            )
        retry = await api.post(
            f"/internal/smoke/jobs/{rollback['id']}/finish",
            json={**ref(rollback), "pages": manifest("success")},
            headers=service,
        )
        record(
            "same receipt safely completes after SQL rollback",
            retry.status_code == 200,
            retry.json(),
        )

        race = await create(delay=0)
        await api.post(
            f"/internal/smoke/jobs/{race['id']}/start", json=ref(race), headers=service
        )
        completed, cancellation = await asyncio.gather(
            api.post(
                f"/internal/smoke/jobs/{race['id']}/finish",
                json={**ref(race), "pages": manifest("success")},
                headers=service,
            ),
            api.post(f"/smoke/jobs/{race['id']}/cancel", headers=marker),
        )
        after_race = await current(race)
        final_count = sql(
            f"select count(*)::int as count from smoke_outbox where job_id='{race['id']}' and event->>'event_type'='job.finalized.v1'"
        )[0]["count"]
        record(
            "concurrent SQL completion/cancellation has one immutable terminal",
            cancellation.status_code == 200
            and completed.status_code in (200, 409)
            and final_count == 1
            and (
                after_race["status"] == "SUCCEEDED"
                or (
                    after_race["status"] == "CANCELLED" and after_race["result"] is None
                )
            ),
            after_race,
        )
        start("dispatcher")

        # Stop all services, retain this disposable volume, and restore the recorded references.
        await asyncio.to_thread(down)
        await asyncio.to_thread(up, True)
        persisted = await current(success)
        record(
            "full stack stop/start preserves Job/snapshot/result",
            persisted["result"] == success["result"]
            and persisted["snapshotId"] == success["snapshotId"],
            persisted,
        )
        query = ",".join(f"'{identifier}'" for identifier in set(JOB_IDS))
        rows = sql(f"select event from smoke_outbox where job_id in ({query})")
        (RUNTIME / "events.json").write_text(json.dumps([row["event"] for row in rows]))
        record(
            "real Outbox stores only the three selected event families",
            {row["event"]["event_type"] for row in rows}
            == {"job.accepted.v1", "job.finalized.v1", "job.cancel_requested.v1"},
        )
        unique = sql(
            f"select job_id,count(*)::int as count from smoke_outbox where job_id in ({query}) and event->>'event_type'='job.accepted.v1' group by job_id"
        )
        record(
            "every synthetic Job has exactly one accepted event",
            all(row["count"] == 1 for row in unique),
        )
        await asyncio.to_thread(
            subprocess.run,
            [
                "pnpm",
                "--filter",
                "@canlearn/api",
                "exec",
                "tsx",
                "src/smoke/validate-events.ts",
                str(RUNTIME / "events.json"),
            ],
            cwd=ROOT,
            check=True,
        )
        record("actual persisted event envelopes pass closed CL-008 schemas", True)

        http_path = RUNTIME / "http-observations.json"
        http_path.write_text(json.dumps(HTTP_OBSERVATIONS))
        http_summary = json.loads(contract_cli("validate-http", http_path))
        record(
            "all actual public response bodies/statuses/media pass handwritten OpenAPI",
            True,
        )
        mutated_http = json.loads(http_path.read_text())
        next(row for row in mutated_http if row["status"] < 300)["body"].pop("status")
        http_fault = RUNTIME / "http-mutated.json"
        http_fault.write_text(json.dumps(mutated_http))
        contract_cli("validate-http", http_fault, rejected=True)
        record(
            "removing a field from a captured real Job response makes the gate fail",
            True,
        )
        mutated_events = [row["event"] for row in rows]
        mutated_events[0].pop("schema_version")
        event_fault = RUNTIME / "events-mutated.json"
        event_fault.write_text(json.dumps(mutated_events))
        contract_cli("validate-events", event_fault, rejected=True)
        record("removing a field from a persisted real event makes the gate fail", True)

    record_path = Path(
        os.environ.get("CANLEARN_SMOKE_RECORD", RUNTIME / "integration-results.json")
    )
    record_path.write_text(
        json.dumps(
            {
                "recorded_at": datetime.now(UTC).isoformat(),
                "scope": "real local Web/API/PostgreSQL/Temporal with deterministic synthetic worker",
                "passed": len(RECORDS),
                "checks": RECORDS,
                "http_contract": http_summary,
                "replay_history_sha256": hashlib.sha256(
                    history.to_json().encode()
                ).hexdigest(),
                "replay_history_events": len(history.events),
                "external_model_mineru_gpu_cloud_calls": 0,
            },
            indent=2,
        )
        + "\n"
    )
    print(
        f"{len(RECORDS)} integration checks passed; evidence: {record_path}", flush=True
    )


if __name__ == "__main__":
    asyncio.run(main())
