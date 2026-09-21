import asyncio
import pytest

from evaluation_middleware import (
    ActualWorkflowStep,
    EvaluationRequest,
    ExpectedWorkflow,
    WorkflowEdge,
    WorkflowEvaluator,
    WorkflowOutcome,
    WorkflowPhase,
)


DAG = ExpectedWorkflow(
    phases=(
        WorkflowPhase(phaseId="discovery", displayName="Discovery"),
        WorkflowPhase(phaseId="analysis", displayName="Analysis"),
        WorkflowPhase(phaseId="plan_validation", displayName="Plan validation"),
        WorkflowPhase(phaseId="build", displayName="Build"),
        WorkflowPhase(phaseId="tests", displayName="Tests"),
    ),
    edges=(
        WorkflowEdge(before="discovery", after="analysis"),
        WorkflowEdge(before="analysis", after="plan_validation"),
        WorkflowEdge(before="plan_validation", after="build"),
        WorkflowEdge(before="build", after="tests"),
    ),
)


def test_honored_workflow():
    actual = tuple(
        ActualWorkflowStep(phaseId=p, at=f"2026-01-01T00:00:{i:02d}Z")
        for i, p in enumerate(("discovery", "analysis", "plan_validation", "build", "tests"))
    )
    request = EvaluationRequest(
        evaluationId="w1", targetId="t",
        expectedWorkflow=DAG, actualWorkflow=actual,
    )
    payload = asyncio.run(WorkflowEvaluator().evaluate(request)).payload
    assert payload.outcome is WorkflowOutcome.HONORED
    assert payload.completionRatio == 1.0
    assert payload.violatedEdges == ()
    assert payload.unexecutedPhases == ()


def test_violated_workflow_out_of_order():
    actual = tuple(
        ActualWorkflowStep(phaseId=p, at=f"2026-01-01T00:00:{i:02d}Z")
        for i, p in enumerate(("build", "discovery", "analysis"))
    )
    request = EvaluationRequest(
        evaluationId="w2", targetId="t",
        expectedWorkflow=DAG, actualWorkflow=actual,
    )
    payload = asyncio.run(WorkflowEvaluator().evaluate(request)).payload
    assert payload.outcome is WorkflowOutcome.VIOLATED
    assert ("plan_validation", "build") in payload.violatedEdges
    assert 0.0 <= payload.completionRatio < 1.0


def test_workflow_with_gaps_but_honored():
    # Only discovery + analysis executed. No out-of-order.
    actual = (
        ActualWorkflowStep(phaseId="discovery", at="2026-01-01T00:00:00Z"),
        ActualWorkflowStep(phaseId="analysis",  at="2026-01-01T00:00:01Z"),
    )
    request = EvaluationRequest(
        evaluationId="w3", targetId="t",
        expectedWorkflow=DAG, actualWorkflow=actual,
    )
    payload = asyncio.run(WorkflowEvaluator().evaluate(request)).payload
    assert payload.outcome is WorkflowOutcome.HONORED_WITH_GAPS
    assert "plan_validation" in payload.unexecutedPhases
    assert "build" in payload.unexecutedPhases


def test_ordered_projection_is_topologically_sorted():
    order = WorkflowEvaluator.ordered_projection(DAG)
    assert order == ("discovery", "analysis", "plan_validation", "build", "tests")


def test_cycle_raises():
    bad = ExpectedWorkflow(
        phases=(WorkflowPhase(phaseId="a", displayName="A"), WorkflowPhase(phaseId="b", displayName="B")),
        edges=(WorkflowEdge(before="a", after="b"), WorkflowEdge(before="b", after="a")),
    )
    with pytest.raises(ValueError):
        WorkflowEvaluator.assert_acyclic(bad)


def test_no_expected_workflow_is_unverified():
    request = EvaluationRequest(evaluationId="w4", targetId="t")
    payload = asyncio.run(WorkflowEvaluator().evaluate(request)).payload
    assert payload.outcome is WorkflowOutcome.UNVERIFIED
