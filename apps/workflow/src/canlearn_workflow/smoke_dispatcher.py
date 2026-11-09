"""Durable Outbox dispatch through API; this process never connects to business PostgreSQL."""

import asyncio
from typing import Any

from temporalio.client import Client
from temporalio.common import WorkflowIDReusePolicy
from temporalio.exceptions import WorkflowAlreadyStartedError
from temporalio.service import RPCError, RPCStatusCode

from canlearn_workflow.settings import settings
from canlearn_workflow.smoke import SmokeApi, SmokeRef, SyntheticJobWorkflow


async def dispatch(client: Client, api: SmokeApi, delivery: dict[str, Any]) -> None:
    event = delivery["event"]
    payload = event["payload"]
    job = await api.request("GET", f"jobs/{delivery['jobId']}")
    handle = client.get_workflow_handle(job["workflowId"], run_id=job["runId"])
    run_id: str | None = job["runId"]
    if event["event_type"] == "job.accepted.v1":
        ref = SmokeRef(
            job["id"], payload["input_snapshot_id"], payload["admission_epoch"], job["traceId"]
        )
        if delivery["attempts"] == 1 and not run_id:
            try:
                handle = await client.start_workflow(
                    SyntheticJobWorkflow.run,
                    ref,
                    id=job["workflowId"],
                    task_queue=settings.temporal_task_queue,
                    id_reuse_policy=WorkflowIDReusePolicy.REJECT_DUPLICATE,
                )
            except WorkflowAlreadyStartedError:
                handle = client.get_workflow_handle(job["workflowId"])
        # Reclaims query the same execution. Missing history is unknown, never a new launch.
        description = await handle.describe()
        if description.workflow_type != "SyntheticJobWorkflow":
            raise RuntimeError("SMOKE_WORKFLOW_TYPE_CONFLICT")
        history = await handle.fetch_history()
        started = history.events[0].workflow_execution_started_event_attributes
        args = await client.data_converter.decode(started.input.payloads, [SmokeRef])
        if args != [ref]:
            raise RuntimeError("SMOKE_WORKFLOW_SNAPSHOT_CONFLICT")
        run_id = description.run_id
    elif event["event_type"] == "job.cancel_requested.v1":
        if not run_id:
            raise RuntimeError("SMOKE_START_UNCONFIRMED")
        try:
            await handle.signal(
                "cancel_requested",
                {
                    "job_id": job["id"],
                    "epoch": payload["admission_epoch"],
                    "operation_id": payload["operation_id"],
                },
            )
        except RPCError as exc:
            # A completed synthetic workflow may have already confirmed its stop.
            if exc.status != RPCStatusCode.NOT_FOUND or job["terminationState"] != "confirmed":
                raise
    elif event["event_type"] != "job.finalized.v1":
        raise RuntimeError("SMOKE_EVENT_UNSUPPORTED")
    receipt = {"claimToken": delivery["claimToken"]}
    if run_id:
        receipt["runId"] = run_id
    await api.request("POST", f"outbox/{delivery['eventId']}/ack", receipt)


async def serve() -> None:
    client = await Client.connect(settings.temporal_address, namespace=settings.temporal_namespace)
    async with SmokeApi() as api:
        while True:
            delivery: dict[str, Any] | None = None
            try:
                delivery = (await api.request("POST", "outbox/claim"))["delivery"]
                if delivery:
                    await dispatch(client, api, delivery)
            except Exception:
                # Fixed code only: HTTP exceptions must not print service credentials or raw data.
                print("SMOKE_DISPATCH_UNCONFIRMED", flush=True)
                if delivery:
                    try:
                        await api.request(
                            "POST",
                            f"outbox/{delivery['eventId']}/fail",
                            {"claimToken": delivery["claimToken"]},
                        )
                    except Exception:
                        pass  # The durable lease expires; a later dispatcher reconciles it.
            await asyncio.sleep(0.25)


def run() -> None:
    asyncio.run(serve())


if __name__ == "__main__":
    run()
