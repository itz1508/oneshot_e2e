import asyncio

from evaluation_middleware import (
    EvaluationItem,
    EvaluationRequest,
    EvidenceReference,
    RequirementEvaluator,
    RequirementStatus,
)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


def test_missing_requirement_is_never_satisfied():
    ev = RequirementEvaluator()
    req = EvaluationRequest(
        evaluationId="e1",
        targetId="t1",
        requirements=(
            EvaluationItem(itemId="fp-a", kind="requirement", summary="a", required=True),
        ),
        observedComponents=(),
        evidenceReferences=(),
    )
    out = asyncio.run(ev.evaluate(req))
    results = out.payload
    assert len(results) == 1
    assert results[0].status is RequirementStatus.MISSING


def test_evidence_alone_yields_unverified_not_satisfied():
    ev = RequirementEvaluator()
    req = EvaluationRequest(
        evaluationId="e2",
        targetId="t2",
        requirements=(
            EvaluationItem(itemId="fp-b", kind="requirement", summary="b", required=True),
        ),
        observedComponents=(),
        evidenceReferences=(EvidenceReference(referenceId="fp-b", kind="text", summary="only text"),),
    )
    out = asyncio.run(ev.evaluate(req))
    assert out.payload[0].status is RequirementStatus.UNVERIFIED


def test_observation_plus_evidence_is_satisfied():
    ev = RequirementEvaluator()
    req = EvaluationRequest(
        evaluationId="e3",
        targetId="t3",
        requirements=(
            EvaluationItem(itemId="fp-c", kind="requirement", summary="c", required=True),
        ),
        observedComponents=("fp-c",),
        evidenceReferences=(EvidenceReference(referenceId="fp-c", kind="text", summary="ok"),),
    )
    out = asyncio.run(ev.evaluate(req))
    assert out.payload[0].status is RequirementStatus.SATISFIED


def test_dependency_missing_is_blocked_not_missing():
    ev = RequirementEvaluator()
    req = EvaluationRequest(
        evaluationId="e4",
        targetId="t4",
        requirements=(
            EvaluationItem(
                itemId="fp-d",
                kind="requirement",
                summary="depends on x",
                required=True,
                dependsOn=("x",),
            ),
        ),
        observedComponents=(),
        evidenceReferences=(),
    )
    out = asyncio.run(ev.evaluate(req))
    assert out.payload[0].status is RequirementStatus.BLOCKED
    assert "missing dependency: x" in out.payload[0].limitations


def test_optional_unobserved_is_not_applicable():
    ev = RequirementEvaluator()
    req = EvaluationRequest(
        evaluationId="e5",
        targetId="t5",
        requirements=(
            EvaluationItem(itemId="fp-e", kind="requirement", summary="opt", required=False),
        ),
        observedComponents=(),
        evidenceReferences=(),
    )
    out = asyncio.run(ev.evaluate(req))
    assert out.payload[0].status is RequirementStatus.NOT_APPLICABLE
