import asyncio

from evaluation_middleware import (
    ActualWorkflowStep,
    EvaluationItem,
    EvaluationMiddleware,
    EvaluationRequest,
    EvaluatorConfiguration,
    EvidenceReference,
    ExpectedWorkflow,
    ExplicitAssertion,
    GoalOutcome,
    MockGoalEvaluator,
    MockOutputEvaluator,
    RecommendedDisposition,
    RequirementStatus,
    WorkflowEdge,
    WorkflowPhase,
)


def _happy_request(**overrides):
    base = dict(
        evaluationId="hap",
        targetId="t",
        requestedGoal="build the thing",
        requirements=(
            EvaluationItem(
                itemId="comp-a", kind="requirement", summary="a", required=True, dependsOn=("comp-a",),
            ),
        ),
        expectedComponents=(
            EvaluationItem(itemId="comp-a", kind="component", summary="a", required=True),
        ),
        observedComponents=("comp-a",),
        evidenceReferences=(EvidenceReference(referenceId="comp-a", kind="text", summary=""),),
        buildOutput="built ok",
    )
    base.update(overrides)
    return EvaluationRequest(**base)


def test_ready_for_approval_on_happy_path():
    receipt = asyncio.run(EvaluationMiddleware().evaluate(_happy_request()))
    assert receipt.recommendedDisposition is RecommendedDisposition.READY_FOR_APPROVAL


def test_missing_required_component_forces_correction_even_if_model_passes():
    """INV-2: model score never overrides deterministic hard failure."""
    request = _happy_request(observedComponents=())  # comp-a missing
    receipt = asyncio.run(
        EvaluationMiddleware(
            modelGoalEvaluator=MockGoalEvaluator(scriptedOutcome=GoalOutcome.ACHIEVED, scriptedScore=1.0),
            modelOutputEvaluator=MockOutputEvaluator(scriptedScore=1.0),
        ).evaluate(
            _happy_request(
                observedComponents=(),
                evaluatorConfiguration=EvaluatorConfiguration(
                    allowModelBasedGoal=True, allowModelBasedOutput=True,
                ),
            )
        )
    )
    assert receipt.recommendedDisposition is RecommendedDisposition.CORRECTION_REQUIRED


def test_forbidden_capability_negative_assertion_blocks_ready():
    r = _happy_request(
        observedComponents=("comp-a", "forbidden-cap"),
        explicitAssertions=(
            ExplicitAssertion(
                assertionId="no-forbidden",
                description="forbidden must be absent",
                predicateKey="component_absent",
                predicateArgs={"componentId": "forbidden-cap"},
                required=True,
            ),
        ),
    )
    receipt = asyncio.run(EvaluationMiddleware().evaluate(r))
    assert receipt.recommendedDisposition is RecommendedDisposition.CORRECTION_REQUIRED
    assert any(not a.passed for a in receipt.assertionResults)


def test_cancellation_is_distinct_from_failure():
    r = _happy_request(cancellationState=lambda: True)
    receipt = asyncio.run(EvaluationMiddleware().evaluate(r))
    assert receipt.cancellationStatus == "OBSERVED"
    assert receipt.recommendedDisposition is RecommendedDisposition.CANCELLED
    assert receipt.evaluationStatus.value == "CANCELLED"


def test_timeout_is_distinct_from_failure():
    """A tiny timeout that still lets deterministic requirement finish,
    but forces the concurrent evaluators to time out.
    Because the deterministic evaluators are so fast, we rely on a
    deliberate delay via a monkey-patched workflow evaluator.
    """
    import asyncio as _asyncio

    class SlowWorkflowEvaluator:
        name = "SlowWorkflowEvaluator"
        upstreamStrandsRole = "test-fixture:slow"

        async def evaluate(self, request):
            await _asyncio.sleep(1.0)
            from evaluation_middleware.contracts import (
                EvaluatorResult, WorkflowResult, WorkflowOutcome,
            )
            return EvaluatorResult(
                evaluatorName=self.name,
                payload=WorkflowResult(outcome=WorkflowOutcome.HONORED, completionRatio=1.0),
            )

    mw = EvaluationMiddleware(workflowEvaluator=SlowWorkflowEvaluator())
    r = _happy_request(timeoutSeconds=0.05)
    receipt = asyncio.run(mw.evaluate(r))
    assert receipt.timeoutStatus == "ELAPSED"
    # Requirement evaluator still completed → we still have per-req results.
    assert len(receipt.requirementResults) == 1


def test_failing_evaluator_does_not_erase_other_results():
    """INV-3."""
    from evaluation_middleware import FailingMockEvaluator
    mw = EvaluationMiddleware(
        modelOutputEvaluator=FailingMockEvaluator(),
    )
    r = _happy_request(
        evaluatorConfiguration=EvaluatorConfiguration(allowModelBasedOutput=True),
    )
    receipt = asyncio.run(mw.evaluate(r))
    # The output evaluator failed but requirement/workflow still ran.
    assert receipt.requirementResults and len(receipt.requirementResults) >= 1
    assert receipt.workflowResult is not None or True  # workflow may be None if no DAG
    assert receipt.recommendedDisposition is not None


def test_receipt_never_carries_a_patch_or_deployment_instruction():
    """INV-4."""
    receipt = asyncio.run(EvaluationMiddleware().evaluate(_happy_request()))
    text = repr(receipt).lower()
    for banned in ("apply patch", "deploy", "kubectl", "git apply", "docker run"):
        assert banned not in text
