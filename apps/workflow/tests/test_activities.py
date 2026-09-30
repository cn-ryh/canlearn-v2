from canlearn_workflow.activities import verify_worker_health


async def test_worker_health_activity() -> None:
    result = await verify_worker_health()

    assert result.service == "canlearn-workflow"
    assert result.status == "ok"
