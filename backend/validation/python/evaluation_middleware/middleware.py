"""
EvaluationMiddleware — the async facade the framework calls.

Adapts the Strands `evaluate_async.py` pattern into a provider-neutral
middleware. Composes the four deterministic evaluators (plus optional
mock model evaluators) and merges their results into an
EvaluationReceipt.

INV-3: `asyncio.wait_for` timeouts are handled per evaluator, so one
       evaluator hitting its deadline does not erase the payload of an
       evaluator that already finished. Cancellation is similarly
       isolated to whichever evaluator observed it.

INV-2: after all evaluators return, disposition is decided by the
       deterministic layer FIRST. Model-based results can only *lower*
       the disposition (e.g. from READY_FOR_APPROVAL to
       MORE_EVIDENCE_REQUIRED), never raise it.

INV-4: the receipt exposes recommendedDisposition + limitations only.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Mapping, Sequence

from .adapters.multimodal import (
    CosmosMultimodalEvidenceAdapter,
    DeterministicMultimodalEvidenceAdapter,
)
from .contracts import (
    AssertionResult,
    ComponentResult,
    ComponentStatus,
    EvaluationRequest,
    EvaluationReceipt,
    EvaluationStatus,
    Evaluator,
    EvaluatorError,
    EvaluatorResult,
    EvidenceClass,
    EvidenceReference,
    GoalOutcome,
    GoalSuccessResult,
    MultimodalEvidenceAdapter,
    MultimodalObservation,
    MultimodalReadiness,
    OutputQualityGrade,
    OutputQualityResult,
    RecommendedDisposition,
    RequirementResult,
    RequirementStatus,
    WorkflowOutcome,
    WorkflowResult,
)
from .evaluators import (
    DeterministicGoalEvaluator,
    DeterministicOutputEvaluator,
    DeterministicRequirementEvaluator,
    DeterministicWorkflowEvaluator,
    compute_component_results,
)
from .predicates import PredicateContext, evaluate_assertion


def _now() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


@dataclass
class EvaluationMiddleware:
    """Async facade. All state is per-call — the middleware is stateless."""

    requirementEvaluator: DeterministicRequirementEvaluator = field(
        default_factory=DeterministicRequirementEvaluator
    )
    goalEvaluator: DeterministicGoalEvaluator = field(
        default_factory=DeterministicGoalEvaluator
    )
    outputEvaluator: DeterministicOutputEvaluator = field(
        default_factory=DeterministicOutputEvaluator
    )
    workflowEvaluator: DeterministicWorkflowEvaluator = field(
        default_factory=DeterministicWorkflowEvaluator
    )
    modelGoalEvaluator: Evaluator | None = None
    modelOutputEvaluator: Evaluator | None = None
    multimodalAdapter: MultimodalEvidenceAdapter = field(
        default_factory=DeterministicMultimodalEvidenceAdapter
    )

    async def evaluate(self, request: EvaluationRequest) -> EvaluationReceipt:
        startedAt = _now()
        cancellation_observed_at_start = False
        if request.cancellationState is not None and request.cancellationState():
            cancellation_observed_at_start = True

        limitations: list[str] = []
        evaluator_errors: list[EvaluatorError] = []
        timeout_status = "NONE"
        cancellation_status = "NONE"
        if cancellation_observed_at_start:
            cancellation_status = "OBSERVED"

        # -------------------------------------------------------------
        # Step 1: RequirementEvaluator (deterministic — always runs)
        # -------------------------------------------------------------
        if cancellation_observed_at_start:
            requirement_results: tuple[RequirementResult, ...] = ()
        else:
            requirement_results = await self._run_requirement(
                request, evaluator_errors, limitations, deadline=request.timeoutSeconds
            )

        # -------------------------------------------------------------
        # Step 2 (independent): Goal + Output + Workflow evaluators
        #   Run concurrently. Each has its own timeout window
        #   (a fraction of overall timeout if set). Failures / timeouts
        #   are recorded separately.
        # -------------------------------------------------------------
        cfg = request.evaluatorConfiguration
        cancel_flag = request.cancellationState or (lambda: False)

        async def run_goal() -> tuple[str, EvaluatorResult]:
            evaluator = self.modelGoalEvaluator if cfg.allowModelBasedGoal and self.modelGoalEvaluator else self.goalEvaluator
            if hasattr(evaluator, "evaluate"):
                try:
                    result = await evaluator.evaluate(
                        request, requirement_results=requirement_results
                    )  # type: ignore[call-arg]
                except TypeError:
                    result = await evaluator.evaluate(request)  # type: ignore[misc]
                return ("goal", result)
            return ("goal", EvaluatorResult(evaluatorName="GoalEvaluator", error=EvaluatorError(
                evaluatorName="GoalEvaluator", code="NOT_CONFIGURED", message="no goal evaluator"
            )))

        async def run_output() -> tuple[str, EvaluatorResult]:
            evaluator = self.modelOutputEvaluator if cfg.allowModelBasedOutput and self.modelOutputEvaluator else self.outputEvaluator
            if hasattr(evaluator, "evaluate"):
                try:
                    result = await evaluator.evaluate(
                        request, requirement_results=requirement_results
                    )  # type: ignore[call-arg]
                except TypeError:
                    result = await evaluator.evaluate(request)  # type: ignore[misc]
                return ("output", result)
            return ("output", EvaluatorResult(evaluatorName="OutputEvaluator", error=EvaluatorError(
                evaluatorName="OutputEvaluator", code="NOT_CONFIGURED", message="no output evaluator"
            )))

        async def run_workflow() -> tuple[str, EvaluatorResult]:
            return ("workflow", await self.workflowEvaluator.evaluate(request))

        planned: list[asyncio.Task] = []
        # Deterministic layer always considered "on". Model-based
        # subordinate evaluators are wrapped by the same run_* function
        # via cfg gating.
        if cfg.runGoalSuccess and not cancel_flag() and not cancellation_observed_at_start:
            planned.append(asyncio.create_task(run_goal(), name="goal"))
        if cfg.runOutputQuality and not cancel_flag() and not cancellation_observed_at_start:
            planned.append(asyncio.create_task(run_output(), name="output"))
        if cfg.runWorkflow and not cancel_flag() and not cancellation_observed_at_start:
            planned.append(asyncio.create_task(run_workflow(), name="workflow"))

        goal_result: EvaluatorResult | None = None
        output_result: EvaluatorResult | None = None
        workflow_result: EvaluatorResult | None = None

        if planned:
            deadline = request.timeoutSeconds if request.timeoutSeconds else None
            try:
                done, pending = await asyncio.wait(planned, timeout=deadline)
            except Exception as exc:  # pragma: no cover - defensive
                limitations.append(f"asyncio.wait raised: {exc!r}")
                done, pending = set(planned), set()

            for task in done:
                try:
                    label, result = task.result()
                except Exception as exc:  # pragma: no cover
                    label = task.get_name() or "unknown"
                    result = EvaluatorResult(
                        evaluatorName=label,
                        error=EvaluatorError(evaluatorName=label, code="RAISED", message=str(exc)),
                    )
                if label == "goal":
                    goal_result = result
                elif label == "output":
                    output_result = result
                elif label == "workflow":
                    workflow_result = result

            for task in pending:
                task.cancel()
                label = task.get_name() or "unknown"
                timeout_status = "ELAPSED"
                stub = EvaluatorResult(
                    evaluatorName=label,
                    timedOut=True,
                    error=EvaluatorError(
                        evaluatorName=label,
                        code="TIMEOUT",
                        message=f"evaluator exceeded {request.timeoutSeconds}s deadline",
                    ),
                )
                if label == "goal":
                    goal_result = stub
                elif label == "output":
                    output_result = stub
                elif label == "workflow":
                    workflow_result = stub

        # If cancellation happened AFTER we started but before dispatch
        # was complete, mark unstarted evaluators as cancelled — never
        # as failed.
        if cancel_flag():
            cancellation_status = "OBSERVED"
            for slot_name in ("goal", "output", "workflow"):
                current = {"goal": goal_result, "output": output_result, "workflow": workflow_result}[slot_name]
                if current is None:
                    stub = EvaluatorResult(
                        evaluatorName=slot_name,
                        cancelled=True,
                    )
                    if slot_name == "goal":
                        goal_result = stub
                    elif slot_name == "output":
                        output_result = stub
                    elif slot_name == "workflow":
                        workflow_result = stub

        # Persist evaluator errors from the three concurrent tasks.
        for r in (goal_result, output_result, workflow_result):
            if r is not None and r.error is not None:
                evaluator_errors.append(r.error)

        goal_payload: GoalSuccessResult | None = (
            goal_result.payload if goal_result and isinstance(goal_result.payload, GoalSuccessResult) else None
        )
        output_payload: OutputQualityResult | None = (
            output_result.payload if output_result and isinstance(output_result.payload, OutputQualityResult) else None
        )
        workflow_payload: WorkflowResult | None = (
            workflow_result.payload if workflow_result and isinstance(workflow_result.payload, WorkflowResult) else None
        )

        # -------------------------------------------------------------
        # Step 3: Component classification (deterministic post-req)
        # -------------------------------------------------------------
        req_by_id = {r.itemId: r for r in requirement_results}
        component_results = compute_component_results(request, req_by_id)

        # -------------------------------------------------------------
        # Step 4: Assertions (deterministic, uses req results + workflow)
        # -------------------------------------------------------------
        honored_edges = (
            workflow_payload.honoredEdges if workflow_payload else ()
        )
        ctx = PredicateContext(
            request=request,
            requirementResults=req_by_id,
            workflowHonoredEdges=honored_edges,
        )
        assertion_results: list[AssertionResult] = []
        for a in request.explicitAssertions:
            if cancel_flag():
                assertion_results.append(
                    AssertionResult(
                        assertionId=a.assertionId,
                        passed=False,
                        detail="ASSERTION_CANCELLED",
                    )
                )
                continue
            assertion_results.append(evaluate_assertion(ctx, a))

        # -------------------------------------------------------------
        # Step 5: Optional multimodal observations
        #   Fold the adapter's readiness into a limitation if not READY.
        # -------------------------------------------------------------
        multimodal_observations: list[MultimodalObservation] = list(
            request.optionalMultimodalEvidence
        )
        adapter_ready = self.multimodalAdapter.readiness()
        if adapter_ready is not MultimodalReadiness.READY:
            limitations.append(
                f"MULTIMODAL_ADAPTER_UNAVAILABLE:{adapter_ready.value} — "
                "text and deterministic evaluation continued"
            )

        # -------------------------------------------------------------
        # Step 6: Ratios and disposition
        # -------------------------------------------------------------
        (
            required_component_count,
            observed_component_count,
            satisfied_component_count,
            partial_component_count,
            missing_component_count,
            unverified_component_count,
            blocked_component_count,
            missing_components,
            missing_requirements,
            blocked_requirements,
        ) = self._counts_and_gaps(request, component_results, requirement_results)

        (
            requirement_coverage_ratio,
            verified_coverage_ratio,
            missing_requirement_ratio,
            component_coverage_ratio,
            workflow_completion_ratio,
        ) = self._ratios(
            requirement_results=requirement_results,
            component_results=component_results,
            request=request,
            workflow_payload=workflow_payload,
        )

        # Determine evaluation status.
        if cancellation_status == "OBSERVED":
            eval_status = EvaluationStatus.CANCELLED
        elif timeout_status == "ELAPSED":
            eval_status = EvaluationStatus.PARTIAL
        elif evaluator_errors:
            eval_status = EvaluationStatus.PARTIAL
        else:
            eval_status = EvaluationStatus.COMPLETED

        disposition = self._decide_disposition(
            eval_status=eval_status,
            cancellation_status=cancellation_status,
            timeout_status=timeout_status,
            requirement_results=requirement_results,
            component_results=component_results,
            assertion_results=tuple(assertion_results),
            goal_payload=goal_payload,
            output_payload=output_payload,
            workflow_payload=workflow_payload,
            request=request,
        )

        return EvaluationReceipt(
            evaluationId=request.evaluationId,
            targetId=request.targetId,
            buildId=request.buildId,
            planId=request.planId,
            startedAt=startedAt,
            completedAt=_now(),
            evaluationStatus=eval_status,
            requiredComponentCount=required_component_count,
            observedComponentCount=observed_component_count,
            satisfiedComponentCount=satisfied_component_count,
            partialComponentCount=partial_component_count,
            missingComponentCount=missing_component_count,
            unverifiedComponentCount=unverified_component_count,
            blockedComponentCount=blocked_component_count,
            requirementResults=requirement_results,
            componentResults=component_results,
            assertionResults=tuple(assertion_results),
            goalSuccessResult=goal_payload,
            outputQualityResult=output_payload,
            workflowResult=workflow_payload,
            missingComponents=missing_components,
            missingRequirements=missing_requirements,
            blockedRequirements=blocked_requirements,
            evidenceReferences=request.evidenceReferences,
            multimodalObservations=tuple(multimodal_observations),
            requirementCoverageRatio=requirement_coverage_ratio,
            verifiedCoverageRatio=verified_coverage_ratio,
            missingRequirementRatio=missing_requirement_ratio,
            componentCoverageRatio=component_coverage_ratio,
            workflowCompletionRatio=workflow_completion_ratio,
            limitations=tuple(limitations),
            evaluatorErrors=tuple(evaluator_errors),
            cancellationStatus=cancellation_status,
            timeoutStatus=timeout_status,
            recommendedDisposition=disposition,
        )

    # -----------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------

    async def _run_requirement(
        self,
        request: EvaluationRequest,
        evaluator_errors: list[EvaluatorError],
        limitations: list[str],
        *,
        deadline: float | None,
    ) -> tuple[RequirementResult, ...]:
        try:
            result = await asyncio.wait_for(
                self.requirementEvaluator.evaluate(request),
                timeout=deadline,
            )
        except asyncio.TimeoutError:
            limitations.append("RequirementEvaluator timed out")
            evaluator_errors.append(
                EvaluatorError(
                    evaluatorName="RequirementEvaluator",
                    code="TIMEOUT",
                    message=f"exceeded {deadline}s deadline",
                )
            )
            return ()
        if result.error is not None:
            evaluator_errors.append(result.error)
            return ()
        payload = result.payload
        if isinstance(payload, tuple):
            return payload  # type: ignore[return-value]
        return ()

    def _counts_and_gaps(
        self,
        request: EvaluationRequest,
        component_results: tuple[ComponentResult, ...],
        requirement_results: tuple[RequirementResult, ...],
    ) -> tuple[
        int, int, int, int, int, int, int, tuple[str, ...], tuple[str, ...], tuple[str, ...],
    ]:
        expected = request.expectedComponents
        observed = request.observedComponents
        required_component_count = sum(1 for c in expected if c.required)
        observed_component_count = len(observed)
        satisfied_component_count = sum(
            1 for r in component_results if r.status is ComponentStatus.VERIFIED
        )
        partial_component_count = sum(
            1 for r in component_results if r.status is ComponentStatus.INCOMPLETE
        )
        missing_component_count = sum(
            1 for r in component_results if r.status is ComponentStatus.DECLARED_BUT_MISSING
        )
        unverified_component_count = sum(
            1 for r in component_results if r.status is ComponentStatus.UNVERIFIABLE
        )
        blocked_component_count = sum(
            1 for r in component_results if r.status is ComponentStatus.BLOCKED_BY_DEPENDENCY
        )
        missing_components = tuple(
            sorted(r.componentId for r in component_results if r.status is ComponentStatus.DECLARED_BUT_MISSING)
        )
        missing_requirements = tuple(
            sorted(r.itemId for r in requirement_results if r.status is RequirementStatus.MISSING)
        )
        blocked_requirements = tuple(
            sorted(r.itemId for r in requirement_results if r.status is RequirementStatus.BLOCKED)
        )
        return (
            required_component_count,
            observed_component_count,
            satisfied_component_count,
            partial_component_count,
            missing_component_count,
            unverified_component_count,
            blocked_component_count,
            missing_components,
            missing_requirements,
            blocked_requirements,
        )

    def _ratios(
        self,
        *,
        requirement_results: tuple[RequirementResult, ...],
        component_results: tuple[ComponentResult, ...],
        request: EvaluationRequest,
        workflow_payload: WorkflowResult | None,
    ) -> tuple[float, float, float, float, float]:
        total_req = len(request.requirements)
        satisfied = sum(1 for r in requirement_results if r.status is RequirementStatus.SATISFIED)
        partial = sum(1 for r in requirement_results if r.status is RequirementStatus.PARTIALLY_SATISFIED)
        missing = sum(1 for r in requirement_results if r.status is RequirementStatus.MISSING)
        blocked = sum(1 for r in requirement_results if r.status is RequirementStatus.BLOCKED)

        requirement_coverage_ratio = (
            (satisfied + partial) / total_req if total_req else 0.0
        )
        verified_coverage_ratio = satisfied / total_req if total_req else 0.0
        missing_requirement_ratio = (
            (missing + blocked) / total_req if total_req else 0.0
        )

        expected_components = len(request.expectedComponents)
        verified = sum(1 for r in component_results if r.status is ComponentStatus.VERIFIED)
        component_coverage_ratio = verified / expected_components if expected_components else 0.0

        workflow_completion_ratio = (
            workflow_payload.completionRatio if workflow_payload else 0.0
        )

        return (
            requirement_coverage_ratio,
            verified_coverage_ratio,
            missing_requirement_ratio,
            component_coverage_ratio,
            workflow_completion_ratio,
        )

    def _decide_disposition(
        self,
        *,
        eval_status: EvaluationStatus,
        cancellation_status: str,
        timeout_status: str,
        requirement_results: tuple[RequirementResult, ...],
        component_results: tuple[ComponentResult, ...],
        assertion_results: tuple[AssertionResult, ...],
        goal_payload: GoalSuccessResult | None,
        output_payload: OutputQualityResult | None,
        workflow_payload: WorkflowResult | None,
        request: EvaluationRequest,
    ) -> RecommendedDisposition:
        """
        Deterministic disposition — INV-2 is enforced here.

        A single MISSING or BLOCKED required requirement is enough to
        drive CORRECTION_REQUIRED regardless of the model score.

        Cancellation → CANCELLED (INV-3)
        Timeout      → MORE_EVIDENCE_REQUIRED unless a hard failure is
                        already present (then BLOCKED)
        """
        if cancellation_status == "OBSERVED":
            return RecommendedDisposition.CANCELLED

        required_req_ids = {r.itemId for r in request.requirements if r.required}
        req_by_id = {r.itemId: r for r in requirement_results}

        hard_failure = False
        for rid in required_req_ids:
            rres = req_by_id.get(rid)
            if rres is None:
                hard_failure = True
                break
            if rres.status in {RequirementStatus.MISSING, RequirementStatus.BLOCKED}:
                hard_failure = True
                break

        # Required components declared but missing
        for cr in component_results:
            if cr.status is ComponentStatus.DECLARED_BUT_MISSING:
                hard_failure = True
                break

        # Required assertions that did not pass
        required_assertions_failed = any(
            not a.passed
            for a in assertion_results
            for spec in request.explicitAssertions
            if spec.assertionId == a.assertionId and spec.required
        )

        if hard_failure or required_assertions_failed:
            if timeout_status == "ELAPSED":
                return RecommendedDisposition.BLOCKED
            return RecommendedDisposition.CORRECTION_REQUIRED

        # No hard failures.
        # If workflow was VIOLATED, we still require more evidence
        # before approving.
        if workflow_payload and workflow_payload.outcome is WorkflowOutcome.VIOLATED:
            return RecommendedDisposition.CORRECTION_REQUIRED

        # UNVERIFIED signals push us to MORE_EVIDENCE_REQUIRED.
        unverified_present = any(
            r.status in {RequirementStatus.UNVERIFIED}
            for r in requirement_results
        )
        unverifiable_component_present = any(
            c.status is ComponentStatus.UNVERIFIABLE for c in component_results
        )
        if unverified_present or unverifiable_component_present:
            return RecommendedDisposition.MORE_EVIDENCE_REQUIRED

        if timeout_status == "ELAPSED":
            return RecommendedDisposition.MORE_EVIDENCE_REQUIRED

        # Goal must be ACHIEVED or (there must be at least one required
        # requirement satisfied).
        if goal_payload is not None and goal_payload.outcome is GoalOutcome.NOT_ACHIEVED:
            return RecommendedDisposition.CORRECTION_REQUIRED
        if goal_payload is not None and goal_payload.outcome is GoalOutcome.UNVERIFIED:
            return RecommendedDisposition.MORE_EVIDENCE_REQUIRED

        # Output quality FAIL always blocks readiness.
        if output_payload is not None and output_payload.grade is OutputQualityGrade.FAIL:
            return RecommendedDisposition.CORRECTION_REQUIRED
        if output_payload is not None and output_payload.grade is OutputQualityGrade.MARGINAL:
            return RecommendedDisposition.MORE_EVIDENCE_REQUIRED

        if eval_status is EvaluationStatus.PARTIAL:
            return RecommendedDisposition.MORE_EVIDENCE_REQUIRED

        return RecommendedDisposition.READY_FOR_APPROVAL
