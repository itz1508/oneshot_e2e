"""
Deterministic evaluators — the four OneShot evaluator roles.

Adapted (not copied) from the Strands harness-sdk reference examples:

  Strands upstream                          OneShot role name
  ----------------------------------------  --------------------
  goal_success_rate_evaluator.py          → GoalEvaluator
  goal_success_rate_with_assertions...    → (assertions live in the
                                             middleware, not in the
                                             goal evaluator)
  output_evaluator.py                     → OutputEvaluator
  trajectory_evaluator.py                 → WorkflowEvaluator
  evaluate_async.py                       → EvaluationMiddleware
                                             (middleware.py)

Each deterministic evaluator here NEVER calls a live model. Model-based
evaluators are provided separately as thin subclasses (see the
`mock_model_evaluators.py` module) and are OFF by default in
EvaluatorConfiguration.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Mapping

from .contracts import (
    ActualWorkflowStep,
    ComponentResult,
    ComponentStatus,
    EvaluationItem,
    EvaluationRequest,
    Evaluator,
    EvaluatorError,
    EvaluatorResult,
    ExpectedWorkflow,
    GoalOutcome,
    GoalSuccessResult,
    OutputQualityGrade,
    OutputQualityResult,
    RequirementResult,
    RequirementStatus,
    WorkflowEdge,
    WorkflowOutcome,
    WorkflowResult,
)


# ---------------------------------------------------------------------------
# RequirementEvaluator — deterministic coverage
# ---------------------------------------------------------------------------


@dataclass
class DeterministicRequirementEvaluator:
    """Compare each requirement against observed components and evidence.

    Rules (per the approved spec):

      - If itemId or dependency components are present in
        observedComponents AND at least one supporting evidence
        reference matches the itemId (by referenceId or by itemId
        appearing in referenceId), the requirement is SATISFIED.
      - If observed components partially cover the dependencies but
        not fully, PARTIALLY_SATISFIED.
      - If itemId's dependencies include a component not in
        observedComponents AND the dependency itself is not in the
        requirement list, BLOCKED.
      - If required=False AND no observation matches, NOT_APPLICABLE.
      - If required=True AND no observation and no dependency signal,
        MISSING.
      - Otherwise (no signal either way but required), UNVERIFIED.

    INV-1: never treat "no signal" as SATISFIED.
    """

    name: str = "RequirementEvaluator"
    upstreamStrandsRole: str = (
        "adapted-from:strands.harness.evals.goal_success_rate_evaluator"
    )

    async def evaluate(self, request: EvaluationRequest) -> EvaluatorResult:
        try:
            results = self._compute(request)
            return EvaluatorResult(evaluatorName=self.name, payload=results)
        except Exception as exc:  # pragma: no cover - defensive
            return EvaluatorResult(
                evaluatorName=self.name,
                error=EvaluatorError(
                    evaluatorName=self.name,
                    code="INTERNAL",
                    message=str(exc),
                ),
            )

    def _compute(
        self, request: EvaluationRequest
    ) -> tuple[RequirementResult, ...]:
        observed = set(request.observedComponents)
        evidence_ids = {ref.referenceId for ref in request.evidenceReferences}

        results: list[RequirementResult] = []
        for item in request.requirements:
            covered_deps = [d for d in item.dependsOn if d in observed]
            missing_deps = [d for d in item.dependsOn if d not in observed]
            has_evidence = (
                item.itemId in evidence_ids
                or any(item.itemId in eid for eid in evidence_ids)
            )
            id_observed = item.itemId in observed

            if not item.required and not id_observed and not has_evidence:
                results.append(
                    RequirementResult(
                        itemId=item.itemId,
                        status=RequirementStatus.NOT_APPLICABLE,
                        reasonCode="OPTIONAL_AND_UNOBSERVED",
                    )
                )
                continue

            if missing_deps and not id_observed and not has_evidence:
                results.append(
                    RequirementResult(
                        itemId=item.itemId,
                        status=RequirementStatus.BLOCKED,
                        limitations=tuple(
                            f"missing dependency: {d}" for d in missing_deps
                        ),
                        reasonCode="DEPENDENCY_MISSING",
                    )
                )
                continue

            if id_observed and has_evidence:
                results.append(
                    RequirementResult(
                        itemId=item.itemId,
                        status=RequirementStatus.SATISFIED,
                        evidence=tuple(sorted(evidence_ids & {item.itemId})) or (item.itemId,),
                        reasonCode="OBSERVED_AND_EVIDENCED",
                    )
                )
                continue

            if id_observed or (item.dependsOn and covered_deps):
                results.append(
                    RequirementResult(
                        itemId=item.itemId,
                        status=RequirementStatus.PARTIALLY_SATISFIED,
                        evidence=tuple(covered_deps),
                        limitations=("no direct evidence reference",),
                        reasonCode="COMPONENT_PRESENT_WITHOUT_EVIDENCE",
                    )
                )
                continue

            if has_evidence:
                results.append(
                    RequirementResult(
                        itemId=item.itemId,
                        status=RequirementStatus.UNVERIFIED,
                        limitations=("evidence exists but no observable component",),
                        reasonCode="EVIDENCE_WITHOUT_COMPONENT",
                    )
                )
                continue

            results.append(
                RequirementResult(
                    itemId=item.itemId,
                    status=RequirementStatus.MISSING,
                    reasonCode="NO_SIGNAL",
                )
            )
        return tuple(results)


# ---------------------------------------------------------------------------
# Component calculation — helper used by middleware, not itself an Evaluator
# ---------------------------------------------------------------------------


def compute_component_results(
    request: EvaluationRequest,
    requirement_results: Mapping[str, RequirementResult],
) -> tuple[ComponentResult, ...]:
    """Classify every expected component against observed inventory.

    Statuses (per spec):
      - VERIFIED               — declared, observed, and at least one
                                  associated requirement is SATISFIED.
      - INCOMPLETE             — declared and observed but every
                                  associated requirement is
                                  PARTIALLY_SATISFIED / UNVERIFIED.
      - DECLARED_BUT_MISSING   — declared but NOT observed.
      - PRESENT_BUT_UNUSED     — observed but not declared and not
                                  referenced by any requirement.
      - UNVERIFIABLE           — declared and observed but no
                                  requirement references it and no
                                  evidence supports it.
      - BLOCKED_BY_DEPENDENCY  — declared, observed, but one of its
                                  dependsOn components is missing.
    """
    observed = set(request.observedComponents)
    expected_by_id = {c.itemId: c for c in request.expectedComponents}
    evidence_ids = {ref.referenceId for ref in request.evidenceReferences}

    # Reverse map requirement.itemId -> associated component ids via dependsOn
    reqs_referring_to: dict[str, list[str]] = defaultdict(list)
    for req in request.requirements:
        for d in req.dependsOn:
            reqs_referring_to[d].append(req.itemId)

    results: list[ComponentResult] = []
    for comp in request.expectedComponents:
        cid = comp.itemId
        is_observed = cid in observed
        associated = reqs_referring_to.get(cid, [])
        associated_statuses = [
            requirement_results[a].status
            for a in associated
            if a in requirement_results
        ]

        if not is_observed:
            if not comp.required:
                # Optional expected components that were not observed are
                # not a hard failure — surface them as UNVERIFIABLE.
                results.append(
                    ComponentResult(
                        componentId=cid,
                        status=ComponentStatus.UNVERIFIABLE,
                        limitations=(
                            "optional component was declared but not observed",
                        ),
                    )
                )
                continue
            results.append(
                ComponentResult(
                    componentId=cid,
                    status=ComponentStatus.DECLARED_BUT_MISSING,
                    limitations=("component not present in observedComponents",),
                )
            )
            continue

        # Check dependency block
        dep_missing = [d for d in comp.dependsOn if d not in observed]
        if dep_missing:
            results.append(
                ComponentResult(
                    componentId=cid,
                    status=ComponentStatus.BLOCKED_BY_DEPENDENCY,
                    limitations=tuple(f"missing dependency: {d}" for d in dep_missing),
                )
            )
            continue

        if any(s is RequirementStatus.SATISFIED for s in associated_statuses):
            evidence_hit = tuple(
                sorted(e for e in evidence_ids if cid in e)
            ) or (cid,) if cid in evidence_ids else tuple(
                sorted(e for e in evidence_ids if cid in e)
            )
            results.append(
                ComponentResult(
                    componentId=cid,
                    status=ComponentStatus.VERIFIED,
                    evidence=evidence_hit,
                )
            )
            continue

        if associated_statuses:
            # Observed but no SATISFIED requirement -> INCOMPLETE
            results.append(
                ComponentResult(
                    componentId=cid,
                    status=ComponentStatus.INCOMPLETE,
                    limitations=(
                        f"associated requirements: {sorted(associated)!r}",
                    ),
                )
            )
            continue

        # Observed but no associated requirement
        results.append(
            ComponentResult(
                componentId=cid,
                status=ComponentStatus.UNVERIFIABLE,
                limitations=("no requirement references this component",),
            )
        )

    # PRESENT_BUT_UNUSED for observed components that were not expected
    referenced_by_reqs = set(
        d
        for req in request.requirements
        for d in req.dependsOn
    )
    for cid in observed:
        if cid in expected_by_id:
            continue
        if cid in referenced_by_reqs:
            # If a requirement referenced it via dependsOn, it's not
            # "unused". We still had no expected declaration for it — but
            # the safer classification is UNVERIFIABLE (declared where?).
            results.append(
                ComponentResult(
                    componentId=cid,
                    status=ComponentStatus.UNVERIFIABLE,
                    limitations=(
                        "observed component appears in requirement dependsOn "
                        "but not in expectedComponents",
                    ),
                )
            )
            continue
        results.append(
            ComponentResult(
                componentId=cid,
                status=ComponentStatus.PRESENT_BUT_UNUSED,
                limitations=("observed but neither declared nor referenced",),
            )
        )

    return tuple(results)


# ---------------------------------------------------------------------------
# GoalEvaluator — deterministic, inferred-goal or explicit-assertion mode
# ---------------------------------------------------------------------------


@dataclass
class DeterministicGoalEvaluator:
    """Determine goal outcome from deterministic signals.

    Rules:
      - If the request has no requestedGoal AND no requirements, mark
        UNVERIFIED (INV-1).
      - Otherwise start from the requirement coverage payload (attached
        by the middleware as request-scoped state) and compute:
          * ACHIEVED    — every REQUIRED requirement is SATISFIED
          * PARTIAL     — some REQUIRED requirements SATISFIED or
                           PARTIALLY_SATISFIED, none MISSING/BLOCKED
          * NOT_ACHIEVED — any REQUIRED requirement is MISSING/BLOCKED
          * UNVERIFIED  — everything is UNVERIFIED
    """

    name: str = "GoalEvaluator"
    upstreamStrandsRole: str = (
        "adapted-from:strands.harness.evals.goal_success_rate_evaluator"
    )

    async def evaluate(
        self,
        request: EvaluationRequest,
        *,
        requirement_results: tuple[RequirementResult, ...] | None = None,
    ) -> EvaluatorResult:
        try:
            if not request.requestedGoal and not request.requirements:
                return EvaluatorResult(
                    evaluatorName=self.name,
                    payload=GoalSuccessResult(
                        outcome=GoalOutcome.UNVERIFIED,
                        detail="no requestedGoal and no requirements",
                    ),
                )

            reqs = list(requirement_results or ())
            required_by_id = {r.itemId: r for r in request.requirements if r.required}
            if not required_by_id:
                # Only optional requirements — inferred goal cannot be
                # deterministically verified.
                return EvaluatorResult(
                    evaluatorName=self.name,
                    payload=GoalSuccessResult(
                        outcome=GoalOutcome.UNVERIFIED,
                        detail="no required requirements",
                    ),
                )

            statuses = [
                r.status for r in reqs if r.itemId in required_by_id
            ]
            if not statuses:
                return EvaluatorResult(
                    evaluatorName=self.name,
                    payload=GoalSuccessResult(
                        outcome=GoalOutcome.UNVERIFIED,
                        detail="requirement coverage did not run",
                    ),
                )

            if all(s is RequirementStatus.SATISFIED for s in statuses):
                outcome = GoalOutcome.ACHIEVED
            elif any(s in {RequirementStatus.MISSING, RequirementStatus.BLOCKED} for s in statuses):
                outcome = GoalOutcome.NOT_ACHIEVED
            elif all(s is RequirementStatus.UNVERIFIED for s in statuses):
                outcome = GoalOutcome.UNVERIFIED
            else:
                outcome = GoalOutcome.PARTIAL

            return EvaluatorResult(
                evaluatorName=self.name,
                payload=GoalSuccessResult(
                    outcome=outcome,
                    detail=f"required-count={len(statuses)}",
                ),
            )
        except Exception as exc:  # pragma: no cover - defensive
            return EvaluatorResult(
                evaluatorName=self.name,
                error=EvaluatorError(
                    evaluatorName=self.name,
                    code="INTERNAL",
                    message=str(exc),
                ),
            )


# ---------------------------------------------------------------------------
# OutputEvaluator — deterministic rubric summary
# ---------------------------------------------------------------------------


@dataclass
class DeterministicOutputEvaluator:
    """Rubric-based output quality — deterministic surface features only.

    We compute a rubric score for each of the six rubric axes based on
    unambiguous surface properties of `buildOutput` and the evidence /
    requirement signals:

      completeness           — every REQUIRED requirement is SATISFIED
      correctness            — no requirement is MISSING or BLOCKED
      contract_compliance    — every expectedComponent is observed
      evidence_support       — every requirement has at least one
                                evidence reference
      clarity                — buildOutput is non-empty and shorter
                                than 200 KB
      requested_format       — an optional expectedFormatSubstring tag
                                (encoded in requirement.tags) appears
                                in buildOutput; if none declared,
                                the axis reports UNVERIFIED implicitly
                                by scoring 0.5.
    """

    name: str = "OutputEvaluator"
    upstreamStrandsRole: str = (
        "adapted-from:strands.harness.evals.output_evaluator"
    )

    async def evaluate(
        self,
        request: EvaluationRequest,
        *,
        requirement_results: tuple[RequirementResult, ...] | None = None,
    ) -> EvaluatorResult:
        try:
            reqs = list(requirement_results or ())
            required = [r for r in reqs if any(
                item.itemId == r.itemId and item.required
                for item in request.requirements
            )]
            evidence_ids = {ref.referenceId for ref in request.evidenceReferences}

            def _score(pred: bool) -> float:
                return 1.0 if pred else 0.0

            completeness = _score(
                bool(required) and all(r.status is RequirementStatus.SATISFIED for r in required)
            )
            correctness = _score(
                not any(r.status in {RequirementStatus.MISSING, RequirementStatus.BLOCKED} for r in reqs)
            )
            observed = set(request.observedComponents)
            contract_compliance = _score(
                bool(request.expectedComponents)
                and all(c.itemId in observed for c in request.expectedComponents)
            )
            evidence_support = _score(
                bool(reqs)
                and all(
                    any(r.itemId in eid for eid in evidence_ids) or r.itemId in evidence_ids
                    for r in reqs
                )
            )
            output_bytes = len(request.buildOutput.encode("utf-8"))
            clarity = _score(0 < output_bytes <= 200_000)

            format_tags = [
                t.split(":", 1)[1]
                for item in request.requirements
                for t in item.tags
                if t.startswith("expected_format:")
            ]
            if not format_tags:
                requested_format = 0.5
            else:
                requested_format = _score(
                    all(t in request.buildOutput for t in format_tags)
                )

            rubric = {
                "completeness": completeness,
                "correctness": correctness,
                "contract_compliance": contract_compliance,
                "evidence_support": evidence_support,
                "clarity": clarity,
                "requested_format": requested_format,
            }
            avg = sum(rubric.values()) / len(rubric)
            # Grade thresholds are conservative — a MARGINAL score
            # never overrides a deterministic missing requirement.
            if completeness == 1.0 and correctness == 1.0 and avg >= 0.8:
                grade = OutputQualityGrade.PASS
            elif correctness == 0.0:
                grade = OutputQualityGrade.FAIL
            elif avg >= 0.5:
                grade = OutputQualityGrade.MARGINAL
            else:
                grade = OutputQualityGrade.FAIL

            return EvaluatorResult(
                evaluatorName=self.name,
                payload=OutputQualityResult(
                    grade=grade,
                    modelDerivedScore=None,
                    rubricScores=rubric,
                    detail=f"avg={avg:.3f}",
                ),
            )
        except Exception as exc:  # pragma: no cover
            return EvaluatorResult(
                evaluatorName=self.name,
                error=EvaluatorError(
                    evaluatorName=self.name,
                    code="INTERNAL",
                    message=str(exc),
                ),
            )


# ---------------------------------------------------------------------------
# WorkflowEvaluator — DAG canonical + ordered projection
# ---------------------------------------------------------------------------


@dataclass
class DeterministicWorkflowEvaluator:
    """Compare an ExpectedWorkflow DAG to an ordered ActualWorkflow trace.

    Public OneShot vocabulary: "workflow". Adapter metadata:
    upstreamStrandsRole="adapted-from:strands.harness.evals.trajectory_evaluator".
    """

    name: str = "WorkflowEvaluator"
    upstreamStrandsRole: str = (
        "adapted-from:strands.harness.evals.trajectory_evaluator"
    )

    async def evaluate(self, request: EvaluationRequest) -> EvaluatorResult:
        try:
            expected = request.expectedWorkflow
            actual: tuple[ActualWorkflowStep, ...] = request.actualWorkflow

            if expected is None:
                return EvaluatorResult(
                    evaluatorName=self.name,
                    payload=WorkflowResult(
                        outcome=WorkflowOutcome.UNVERIFIED,
                        completionRatio=0.0,
                        limitations=("no expectedWorkflow supplied",),
                    ),
                )

            self.assert_acyclic(expected)
            phase_ids = {p.phaseId for p in expected.phases}
            actual_phases = [step.phaseId for step in actual]
            actual_positions: dict[str, int] = {}
            for idx, phase in enumerate(actual_phases):
                # keep FIRST occurrence for prerequisite checks
                actual_positions.setdefault(phase, idx)

            honored: list[tuple[str, str]] = []
            violated: list[tuple[str, str]] = []
            unexecuted_edges: list[tuple[str, str]] = []
            for edge in expected.edges:
                before_pos = actual_positions.get(edge.before)
                after_pos = actual_positions.get(edge.after)
                if before_pos is None and after_pos is None:
                    # Neither participant executed — pure gap.
                    unexecuted_edges.append((edge.before, edge.after))
                    continue
                if before_pos is None and after_pos is not None:
                    # Successor executed without its prerequisite —
                    # this IS an order violation.
                    violated.append((edge.before, edge.after))
                    continue
                if before_pos is not None and after_pos is None:
                    # Prerequisite executed but successor did not —
                    # not a violation, just incomplete.
                    unexecuted_edges.append((edge.before, edge.after))
                    continue
                if before_pos <= after_pos:
                    honored.append((edge.before, edge.after))
                else:
                    violated.append((edge.before, edge.after))

            executed = {p for p in actual_phases if p in phase_ids}
            unexecuted = tuple(sorted(p.phaseId for p in expected.phases if p.phaseId not in executed))

            total_edges = len(expected.edges)
            completion = (len(honored) / total_edges) if total_edges > 0 else (
                1.0 if not unexecuted else 0.0
            )

            if not violated and not unexecuted and not unexecuted_edges:
                outcome = WorkflowOutcome.HONORED
            elif not violated:
                outcome = WorkflowOutcome.HONORED_WITH_GAPS
            else:
                outcome = WorkflowOutcome.VIOLATED

            return EvaluatorResult(
                evaluatorName=self.name,
                payload=WorkflowResult(
                    outcome=outcome,
                    completionRatio=completion,
                    honoredEdges=tuple(honored),
                    violatedEdges=tuple(violated),
                    unexecutedPhases=unexecuted,
                ),
            )
        except Exception as exc:  # pragma: no cover
            return EvaluatorResult(
                evaluatorName=self.name,
                error=EvaluatorError(
                    evaluatorName=self.name,
                    code="INTERNAL",
                    message=str(exc),
                ),
            )

    @staticmethod
    def assert_acyclic(workflow: ExpectedWorkflow) -> None:
        """Guard: expected workflow DAG must be acyclic."""
        graph: dict[str, list[str]] = {p.phaseId: [] for p in workflow.phases}
        for edge in workflow.edges:
            graph.setdefault(edge.before, []).append(edge.after)

        WHITE, GRAY, BLACK = 0, 1, 2
        color: dict[str, int] = {n: WHITE for n in graph}

        def visit(n: str) -> None:
            if color[n] == BLACK:
                return
            if color[n] == GRAY:
                raise ValueError(f"workflow cycle at {n}")
            color[n] = GRAY
            for m in graph[n]:
                visit(m)
            color[n] = BLACK

        for n in list(color.keys()):
            visit(n)

    @staticmethod
    def ordered_projection(workflow: ExpectedWorkflow) -> tuple[str, ...]:
        """Emit a canonical topological order of the DAG.

        Uses Kahn's algorithm — nodes with no incoming edges first,
        breaking ties alphabetically for determinism.
        """
        incoming: dict[str, int] = {p.phaseId: 0 for p in workflow.phases}
        adj: dict[str, list[str]] = {p.phaseId: [] for p in workflow.phases}
        for edge in workflow.edges:
            adj.setdefault(edge.before, []).append(edge.after)
            incoming[edge.after] = incoming.get(edge.after, 0) + 1
            incoming.setdefault(edge.before, incoming.get(edge.before, 0))
        available = sorted([n for n, c in incoming.items() if c == 0])
        ordered: list[str] = []
        while available:
            n = available.pop(0)
            ordered.append(n)
            for m in adj.get(n, []):
                incoming[m] -= 1
                if incoming[m] == 0:
                    # keep sorted for deterministic order
                    idx = 0
                    while idx < len(available) and available[idx] < m:
                        idx += 1
                    available.insert(idx, m)
        if len(ordered) != len(incoming):
            raise ValueError("workflow DAG is not acyclic")
        return tuple(ordered)
