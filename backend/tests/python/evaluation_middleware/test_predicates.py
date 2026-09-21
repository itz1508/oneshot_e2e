from evaluation_middleware import (
    EvaluationRequest,
    EvidenceReference,
    ExplicitAssertion,
    PREDICATE_REGISTRY,
    RequirementResult,
    RequirementStatus,
    evaluate_assertion,
)
from evaluation_middleware.predicates import PredicateContext


def _ctx(**kwargs):
    request = EvaluationRequest(evaluationId="p", targetId="t", **kwargs)
    return PredicateContext(request=request)


def test_unknown_predicate_fails_never_passes():
    ctx = _ctx()
    a = ExplicitAssertion(
        assertionId="a1",
        description="",
        predicateKey="output_evaluator__hallucinated",
        predicateArgs={},
    )
    result = evaluate_assertion(ctx, a)
    assert result.passed is False
    assert "UNKNOWN_PREDICATE" in result.detail


def test_output_contains_substring():
    ctx = _ctx(buildOutput="hello world")
    a = ExplicitAssertion(
        assertionId="a1", description="",
        predicateKey="output_contains_substring",
        predicateArgs={"substring": "world"},
    )
    assert evaluate_assertion(ctx, a).passed is True
    b = ExplicitAssertion(
        assertionId="a2", description="",
        predicateKey="output_contains_substring",
        predicateArgs={"substring": "banana"},
    )
    assert evaluate_assertion(ctx, b).passed is False


def test_missing_predicate_arg_fails():
    ctx = _ctx()
    a = ExplicitAssertion(
        assertionId="a1", description="",
        predicateKey="output_contains_substring",
        predicateArgs={},  # no substring
    )
    r = evaluate_assertion(ctx, a)
    assert r.passed is False and r.detail == "MISSING_SUBSTRING_ARG"


def test_component_present_and_absent():
    ctx = _ctx(observedComponents=("a", "b"))
    a = ExplicitAssertion(
        assertionId="p", description="",
        predicateKey="component_present",
        predicateArgs={"componentId": "a"},
    )
    assert evaluate_assertion(ctx, a).passed is True
    b = ExplicitAssertion(
        assertionId="p2", description="",
        predicateKey="component_absent",
        predicateArgs={"componentId": "z"},
    )
    assert evaluate_assertion(ctx, b).passed is True


def test_requirement_marked_satisfied_requires_prior_evaluation():
    request = EvaluationRequest(evaluationId="p", targetId="t")
    ctx = PredicateContext(request=request, requirementResults={
        "r-good": RequirementResult(itemId="r-good", status=RequirementStatus.SATISFIED),
        "r-bad":  RequirementResult(itemId="r-bad",  status=RequirementStatus.MISSING),
    })
    good = ExplicitAssertion(
        assertionId="a", description="",
        predicateKey="requirement_marked_satisfied",
        predicateArgs={"itemId": "r-good"},
    )
    assert evaluate_assertion(ctx, good).passed is True

    bad = ExplicitAssertion(
        assertionId="b", description="",
        predicateKey="requirement_marked_satisfied",
        predicateArgs={"itemId": "r-bad"},
    )
    assert evaluate_assertion(ctx, bad).passed is False

    unknown = ExplicitAssertion(
        assertionId="c", description="",
        predicateKey="requirement_marked_satisfied",
        predicateArgs={"itemId": "r-never-seen"},
    )
    r = evaluate_assertion(ctx, unknown)
    assert r.passed is False
    assert r.detail == "REQUIREMENT_UNEVALUATED"


def test_registry_lists_seven_predicates():
    assert set(PREDICATE_REGISTRY.keys()) == {
        "output_contains_substring",
        "output_matches_regex",
        "component_present",
        "component_absent",
        "evidence_present",
        "requirement_marked_satisfied",
        "workflow_edge_honored",
    }
