import asyncio

from evaluation_middleware import (
    EvaluationMiddleware,
    RecommendedDisposition,
)
from evaluation_middleware.oneshot.adapter import (
    OneShotCapabilitySnapshot,
    build_request_from_capability_snapshot,
)


def test_oneshot_adapter_shapes_a_request_and_middleware_approves():
    request = build_request_from_capability_snapshot(
        evaluationId="oneshot-1",
        targetId="scan-scoped-preview-v2",
        buildId="build-oneshot-1",
        requestedGoal="install main_agent capability",
        expectedCapabilities=("main_agent",),
        optionalCapabilities=("tavily_search",),
        forbiddenCapabilities=("researcher",),
        snapshots=(
            OneShotCapabilitySnapshot("main_agent", observed=True, enabled=True),
            OneShotCapabilitySnapshot("tavily_search", observed=False, enabled=False),
        ),
        buildOutput="the build produced main_agent",
        evidence=(),
    )
    # No evidence → main_agent requirement is PARTIALLY_SATISFIED (component observed but no evidence).
    receipt = asyncio.run(EvaluationMiddleware().evaluate(request))
    # No forbidden capability observed → the negative assertion passed.
    assert all(a.passed for a in receipt.assertionResults)
    # Because there is no evidence attached, we get MORE_EVIDENCE_REQUIRED,
    # not READY_FOR_APPROVAL. Prove that distinction is honored:
    assert receipt.recommendedDisposition is RecommendedDisposition.MORE_EVIDENCE_REQUIRED


def test_oneshot_adapter_detects_forbidden_capability():
    request = build_request_from_capability_snapshot(
        evaluationId="oneshot-2",
        targetId="scan-scoped-preview-v2",
        buildId="build-oneshot-2",
        requestedGoal="install main_agent",
        expectedCapabilities=("main_agent",),
        forbiddenCapabilities=("researcher",),
        snapshots=(
            OneShotCapabilitySnapshot("main_agent", observed=True, enabled=True),
            OneShotCapabilitySnapshot("researcher", observed=True, enabled=True),  # forbidden but observed
        ),
    )
    receipt = asyncio.run(EvaluationMiddleware().evaluate(request))
    assert any(a.assertionId == "forbidden::researcher" and not a.passed for a in receipt.assertionResults)
    assert receipt.recommendedDisposition is RecommendedDisposition.CORRECTION_REQUIRED
