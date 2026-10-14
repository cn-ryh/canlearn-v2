import asyncio

from temporalio.client import Client
from temporalio.worker import Worker

from canlearn_workflow.activities import verify_worker_health
from canlearn_workflow.settings import settings
from canlearn_workflow.smoke import (
    SyntheticJobWorkflow,
    abandon_smoke_job,
    confirm_smoke_stop,
    run_smoke_job,
)
from canlearn_workflow.workflows import HealthCheckWorkflow


async def serve() -> None:
    client = await Client.connect(
        settings.temporal_address,
        namespace=settings.temporal_namespace,
    )
    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[HealthCheckWorkflow, SyntheticJobWorkflow]
        if settings.canlearn_smoke_enabled
        else [HealthCheckWorkflow],
        activities=[verify_worker_health, run_smoke_job, confirm_smoke_stop, abandon_smoke_job]
        if settings.canlearn_smoke_enabled
        else [verify_worker_health],
    )
    await worker.run()


def run() -> None:
    asyncio.run(serve())


if __name__ == "__main__":
    run()
