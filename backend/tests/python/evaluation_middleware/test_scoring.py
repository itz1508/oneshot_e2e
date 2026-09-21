import asyncio

from evaluation_middleware import (
    ActualWorkflowStep,
    EvaluationItem,
    EvaluationMiddleware,
    EvaluationRequest,
    EvidenceReference,
    ExpectedWorkflow,
    WorkflowEdge,
    WorkflowPhase,
)


def test_ratios_are_bounded_and_visible():
    r = EvaluationRequest(
        evaluationId="s1", targetId="t",
        requirements=(
            EvaluationItem(itemId="a", kind="requirement", summary="", required=True, dependsOn=("a",)),
            EvaluationItem(itemId="b", kind="requirement", summary="", required=True, dependsOn=("b",)),
            EvaluationItem(itemId="c", kind="requirement", summary="", required=True, dependsOn=("c",)),
        ),
        expectedComponents=(
            EvaluationItem(itemId="a", kind="component", summary="a", required=True),
            EvaluationItem(itemId="b", kind="component", summary="b", required=True),
            EvaluationItem(itemId="c", kind="component", summary="c", required=True),
        ),
        observedComponents=("a", "b"),  # c missing
        evidenceReferences=(
            EvidenceReference(referenceId="a", kind="text", summary=""),
            EvidenceReference(referenceId="b", kind="text", summary=""),
        ),
    )
    receipt = asyncio.run(EvaluationMiddleware().evaluate(r))
    # a + b requirements: itemId in observedComponents AND evidence → SATISFIED
    # c requirement: dependency 'c' missing → BLOCKED
    assert 0 <= receipt.verifiedCoverageRatio <= 1
    assert receipt.verifiedCoverageRatio == 2 / 3
    assert receipt.missingRequirementRatio == 1 / 3
    assert receipt.componentCoverageRatio == 2 / 3


def test_single_deterministic_missing_beats_high_average():
    """A high aggregate rubric score must not hide a MISSING required component."""
    r = EvaluationRequest(
        evaluationId="s2", targetId="t",
        requirements=(
            EvaluationItem(itemId="critical", kind="requirement", summary="", required=True, dependsOn=("critical",)),
            EvaluationItem(itemId="minor",    kind="requirement", summary="", required=False),
        ),
        expectedComponents=(
            EvaluationItem(itemId="critical", kind="component", summary="", required=True),
        ),
        observedComponents=(),  # critical missing
        buildOutput="a " * 200,  # non-empty (clarity ok)
    )
    receipt = asyncio.run(EvaluationMiddleware().evaluate(r))
    assert "critical" in receipt.missingComponents
    # Disposition = CORRECTION_REQUIRED regardless of rubric averages
    assert receipt.recommendedDisposition.value == "CORRECTION_REQUIRED"
