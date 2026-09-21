import asyncio

from evaluation_middleware import (
    ComponentStatus,
    EvaluationItem,
    EvaluationRequest,
    EvidenceReference,
    RequirementEvaluator,
    RequirementStatus,
    compute_component_results,
)


def _reqs(req):
    return {r.itemId: r for r in asyncio.run(RequirementEvaluator().evaluate(req)).payload}


def test_declared_but_missing():
    request = EvaluationRequest(
        evaluationId="c1",
        targetId="t",
        requirements=(
            EvaluationItem(itemId="r1", kind="requirement", summary="", required=True, dependsOn=("comp-a",)),
        ),
        expectedComponents=(
            EvaluationItem(itemId="comp-a", kind="component", summary="a", required=True),
        ),
        observedComponents=(),
    )
    reqs = _reqs(request)
    comps = compute_component_results(request, reqs)
    by_id = {c.componentId: c for c in comps}
    assert by_id["comp-a"].status is ComponentStatus.DECLARED_BUT_MISSING


def test_verified_component():
    request = EvaluationRequest(
        evaluationId="c2",
        targetId="t",
        requirements=(
            EvaluationItem(itemId="r1", kind="requirement", summary="", required=True, dependsOn=("comp-a",)),
        ),
        expectedComponents=(
            EvaluationItem(itemId="comp-a", kind="component", summary="a", required=True),
        ),
        observedComponents=("comp-a",),
        evidenceReferences=(EvidenceReference(referenceId="r1", kind="text", summary=""),),
    )
    reqs = _reqs(request)
    comps = compute_component_results(request, reqs)
    by_id = {c.componentId: c for c in comps}
    # The requirement r1 depends on comp-a. r1's own itemId does not
    # appear in observedComponents, so the requirement is
    # PARTIALLY_SATISFIED. But comp-a is observed and referenced by
    # the requirement whose associated status is PARTIALLY_SATISFIED
    # → INCOMPLETE. (Verified requires an associated SATISFIED
    # requirement.) That is the deterministic-first stance.
    assert by_id["comp-a"].status is ComponentStatus.INCOMPLETE


def test_verified_when_associated_requirement_is_satisfied():
    request = EvaluationRequest(
        evaluationId="c3",
        targetId="t",
        requirements=(
            EvaluationItem(itemId="comp-a", kind="requirement", summary="requirement on comp-a", required=True, dependsOn=("comp-a",)),
        ),
        expectedComponents=(
            EvaluationItem(itemId="comp-a", kind="component", summary="a", required=True),
        ),
        observedComponents=("comp-a",),
        evidenceReferences=(EvidenceReference(referenceId="comp-a", kind="text", summary=""),),
    )
    reqs = _reqs(request)
    assert reqs["comp-a"].status is RequirementStatus.SATISFIED
    comps = compute_component_results(request, reqs)
    by_id = {c.componentId: c for c in comps}
    assert by_id["comp-a"].status is ComponentStatus.VERIFIED


def test_present_but_unused():
    request = EvaluationRequest(
        evaluationId="c4",
        targetId="t",
        requirements=(),
        expectedComponents=(),
        observedComponents=("stray-comp",),
    )
    reqs = _reqs(request)
    comps = compute_component_results(request, reqs)
    assert len(comps) == 1
    assert comps[0].status is ComponentStatus.PRESENT_BUT_UNUSED


def test_blocked_by_dependency():
    request = EvaluationRequest(
        evaluationId="c5",
        targetId="t",
        requirements=(),
        expectedComponents=(
            EvaluationItem(
                itemId="comp-b", kind="component", summary="b", required=True, dependsOn=("comp-a",)
            ),
        ),
        observedComponents=("comp-b",),
    )
    reqs = _reqs(request)
    comps = compute_component_results(request, reqs)
    by_id = {c.componentId: c for c in comps}
    assert by_id["comp-b"].status is ComponentStatus.BLOCKED_BY_DEPENDENCY
