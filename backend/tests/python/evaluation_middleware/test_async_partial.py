import asyncio

from evaluation_middleware import (
    EvaluationMiddleware,
    EvaluationRequest,
    EvaluationItem,
    EvaluatorConfiguration,
)


async def _slow_evaluator_factory():
    """Build an evaluator that sleeps forever unless cancelled."""
    class _Slow:
        name = "SlowGoal"
        upstreamStrandsRole = "test:slow"
        async def evaluate(self, request, *, requirement_results=None):
            await asyncio.sleep(60)
    return _Slow()


def test_partial_completion_when_one_evaluator_times_out():
    async def main():
        slow = await _slow_evaluator_factory()
        # Configure the middleware so goal evaluator is the slow one
        mw = EvaluationMiddleware(goalEvaluator=slow)
        r = EvaluationRequest(
            evaluationId="ap-1", targetId="t",
            requirements=(EvaluationItem(itemId="r", kind="requirement", summary="", required=True),),
            timeoutSeconds=0.1,
        )
        return await mw.evaluate(r)
    receipt = asyncio.run(main())
    # Deterministic requirement finished, workflow finished, but goal timed out.
    assert receipt.timeoutStatus == "ELAPSED"
    assert receipt.evaluationStatus.value == "PARTIAL"
    # Requirement + workflow results are present
    assert len(receipt.requirementResults) == 1
    assert receipt.workflowResult is not None
    # Goal result absent (timed out — no payload)
    assert receipt.goalSuccessResult is None
    # Evaluator error for goal is recorded
    assert any(e.code == "TIMEOUT" for e in receipt.evaluatorErrors)
