from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from canlearn_workflow.activities import HealthCheckResult, verify_worker_health


@workflow.defn
class HealthCheckWorkflow:
    @workflow.run
    async def run(self) -> HealthCheckResult:
        return await workflow.execute_activity(
            verify_worker_health,
            start_to_close_timeout=timedelta(seconds=10),
        )
