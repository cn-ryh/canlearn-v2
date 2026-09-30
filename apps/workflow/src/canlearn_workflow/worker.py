import asyncio

from temporalio.client import Client
from temporalio.worker import Worker

from canlearn_workflow.activities import verify_worker_health
from canlearn_workflow.settings import settings
from canlearn_workflow.workflows import HealthCheckWorkflow


async def serve() -> None:
    client = await Client.connect(
        settings.temporal_address,
        namespace=settings.temporal_namespace,
    )
    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[HealthCheckWorkflow],
        activities=[verify_worker_health],
    )
    await worker.run()


def run() -> None:
    asyncio.run(serve())


if __name__ == "__main__":
    run()
