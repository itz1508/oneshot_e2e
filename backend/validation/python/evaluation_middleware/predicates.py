"""
Deterministic predicate library used by ExplicitAssertion.

A predicate operates purely over the EvaluationRequest — no I/O, no
network, no shell. Missing predicates return failure with a typed
reason; they NEVER return pass by default (INV-1).

Registered predicates:

  output_contains_substring     — buildOutput contains a literal
  output_matches_regex          — buildOutput matches a regex
  component_present             — observedComponents contains id
  component_absent              — observedComponents lacks id
  evidence_present              — evidenceReferences has referenceId
  requirement_marked_satisfied  — one of the deterministic requirement
                                   results (post-coverage) is SATISFIED
                                   (Middleware evaluates assertions after
                                   the RequirementEvaluator has run.)
  workflow_edge_honored         — a specific (before, after) DAG edge is
                                   honored by actualWorkflow
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping

from .contracts import (
    AssertionResult,
    EvaluationRequest,
    ExplicitAssertion,
    RequirementResult,
    RequirementStatus,
    WorkflowEdge,
)


@dataclass
class PredicateContext:
    """State shared with predicates. requirementResults are populated
    by the middleware AFTER RequirementEvaluator runs so that assertions
    can reference deterministic outcomes."""

    request: EvaluationRequest
    requirementResults: Mapping[str, RequirementResult] = field(default_factory=dict)
    workflowHonoredEdges: tuple[tuple[str, str], ...] = ()


PredicateFn = Callable[[PredicateContext, Mapping[str, Any]], tuple[bool, str]]


def _pred_output_contains_substring(
    ctx: PredicateContext, args: Mapping[str, Any]
) -> tuple[bool, str]:
    needle = args.get("substring")
    if not isinstance(needle, str) or needle == "":
        return False, "MISSING_SUBSTRING_ARG"
    ok = needle in ctx.request.buildOutput
    return ok, "SUBSTRING_FOUND" if ok else "SUBSTRING_NOT_FOUND"


def _pred_output_matches_regex(
    ctx: PredicateContext, args: Mapping[str, Any]
) -> tuple[bool, str]:
    pattern = args.get("pattern")
    if not isinstance(pattern, str) or pattern == "":
        return False, "MISSING_PATTERN_ARG"
    try:
        rex = re.compile(pattern, re.MULTILINE | re.DOTALL)
    except re.error as exc:
        return False, f"BAD_REGEX:{exc}"
    ok = rex.search(ctx.request.buildOutput) is not None
    return ok, "REGEX_MATCH" if ok else "REGEX_NO_MATCH"


def _pred_component_present(
    ctx: PredicateContext, args: Mapping[str, Any]
) -> tuple[bool, str]:
    cid = args.get("componentId")
    if not isinstance(cid, str) or cid == "":
        return False, "MISSING_COMPONENT_ID"
    ok = cid in ctx.request.observedComponents
    return ok, "COMPONENT_PRESENT" if ok else "COMPONENT_ABSENT"


def _pred_component_absent(
    ctx: PredicateContext, args: Mapping[str, Any]
) -> tuple[bool, str]:
    ok, _ = _pred_component_present(ctx, args)
    return (not ok), "COMPONENT_ABSENT" if not ok else "COMPONENT_PRESENT"


def _pred_evidence_present(
    ctx: PredicateContext, args: Mapping[str, Any]
) -> tuple[bool, str]:
    ref = args.get("referenceId")
    if not isinstance(ref, str) or ref == "":
        return False, "MISSING_REFERENCE_ID"
    ok = any(e.referenceId == ref for e in ctx.request.evidenceReferences)
    return ok, "EVIDENCE_PRESENT" if ok else "EVIDENCE_ABSENT"


def _pred_requirement_marked_satisfied(
    ctx: PredicateContext, args: Mapping[str, Any]
) -> tuple[bool, str]:
    item = args.get("itemId")
    if not isinstance(item, str) or item == "":
        return False, "MISSING_ITEM_ID"
    result = ctx.requirementResults.get(item)
    if result is None:
        return False, "REQUIREMENT_UNEVALUATED"
    ok = result.status is RequirementStatus.SATISFIED
    return ok, f"REQUIREMENT_STATUS_{result.status.value}"


def _pred_workflow_edge_honored(
    ctx: PredicateContext, args: Mapping[str, Any]
) -> tuple[bool, str]:
    before = args.get("before")
    after = args.get("after")
    if not (isinstance(before, str) and isinstance(after, str) and before and after):
        return False, "MISSING_EDGE_ARGS"
    ok = (before, after) in ctx.workflowHonoredEdges
    return ok, "EDGE_HONORED" if ok else "EDGE_VIOLATED"


PREDICATE_REGISTRY: Mapping[str, PredicateFn] = {
    "output_contains_substring": _pred_output_contains_substring,
    "output_matches_regex": _pred_output_matches_regex,
    "component_present": _pred_component_present,
    "component_absent": _pred_component_absent,
    "evidence_present": _pred_evidence_present,
    "requirement_marked_satisfied": _pred_requirement_marked_satisfied,
    "workflow_edge_honored": _pred_workflow_edge_honored,
}


def evaluate_assertion(
    ctx: PredicateContext, assertion: ExplicitAssertion
) -> AssertionResult:
    """Evaluate one assertion. Unknown predicate keys FAIL with a typed
    reason — never silently pass.
    """
    fn = PREDICATE_REGISTRY.get(assertion.predicateKey)
    if fn is None:
        return AssertionResult(
            assertionId=assertion.assertionId,
            passed=False,
            detail=f"UNKNOWN_PREDICATE:{assertion.predicateKey}",
        )
    passed, detail = fn(ctx, assertion.predicateArgs)
    return AssertionResult(
        assertionId=assertion.assertionId,
        passed=bool(passed),
        detail=detail,
    )
