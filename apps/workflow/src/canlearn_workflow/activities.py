from dataclasses import dataclass

from temporalio import activity


@dataclass
class HealthCheckResult:
    service: str
    status: str


@activity.defn
async def verify_worker_health() -> HealthCheckResult:
    """A deterministic smoke activity used to validate worker connectivity."""
    return HealthCheckResult(service="canlearn-workflow", status="ok")
