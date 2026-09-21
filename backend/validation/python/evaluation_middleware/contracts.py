"""
Contracts for the OneShot evaluation middleware.

FRAMEWORK_PROOF_ONLY. Deterministic-first. Provider-neutral.

--------------------------------------------------------------------------
Naming discipline (per approved answer to Q1):

    - GoalEvaluator, RequirementEvaluator, OutputEvaluator,
      WorkflowEvaluator are the four evaluator roles the middleware
      composes. These are the *OneShot names*; upstream Strands class
      names (goal_success_rate_evaluator, output_evaluator,
      trajectory_evaluator) are recorded only as adapter metadata.
    - EvaluationMiddleware is the async facade the framework calls.
    - EvaluatorResult is what one evaluator returns.
    - EvaluationResult is the merged per-run intermediate result.
    - EvaluationReceipt is the final structured artifact.
    - EvaluationItem is a single requirement or component instance.
    - MultimodalObservation is a MODEL_DERIVED_VISUAL_OBSERVATION,
      never a confirmed fact / component / requirement / root cause /
      approved implementation.

    - "workflow" is used in every public OneShot contract; "trajectory"
      appears only as adapter metadata on `WorkflowEvaluator`.

CRITICAL invariants encoded in this module (and executed by the tests):

    INV-1 Never-PASS-on-missing:
        A requirement that is blank, missing, skipped, or unevaluated
        MUST NOT be reported SATISFIED.

    INV-2 Required-failure-visible:
        A model-based score, however high, MUST NOT override a
        deterministic missing-requirement disposition.

    INV-3 Timeout-vs-failure-vs-cancellation-are-distinct:
        The receipt reports each independently. One evaluator's timeout
        or cancellation MUST NOT erase another evaluator's result.

    INV-4 No-auto-fixes:
        The receipt exposes recommendedDisposition and limitations only.
        It never carries a source patch, deployment instruction, or
        hidden model reasoning.

    INV-5 Cosmos-observation-is-not-fact:
        A MultimodalObservation is always classified
        MODEL_DERIVED_VISUAL_OBSERVATION. It contributes evidence to
        deterministic comparison but never becomes a component or a
        requirement result on its own.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import (
    Any,
    Awaitable,
    Callable,
    Mapping,
    Optional,
    Protocol,
    Sequence,
    runtime_checkable,
)


# ---------------------------------------------------------------------------
# Enum vocabulary
# ---------------------------------------------------------------------------


class RequirementStatus(str, Enum):
    """The six approved requirement outcomes.

    Never treat MISSING / UNVERIFIED / BLOCKED as PASS.
    """

    SATISFIED = "SATISFIED"
    PARTIALLY_SATISFIED = "PARTIALLY_SATISFIED"
    MISSING = "MISSING"
    UNVERIFIED = "UNVERIFIED"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    BLOCKED = "BLOCKED"


class ComponentStatus(str, Enum):
    """Outcomes for expected components against observed inventory."""

    VERIFIED = "VERIFIED"
    INCOMPLETE = "INCOMPLETE"
    DECLARED_BUT_MISSING = "DECLARED_BUT_MISSING"
    PRESENT_BUT_UNUSED = "PRESENT_BUT_UNUSED"
    UNVERIFIABLE = "UNVERIFIABLE"
    BLOCKED_BY_DEPENDENCY = "BLOCKED_BY_DEPENDENCY"


class GoalOutcome(str, Enum):
    ACHIEVED = "ACHIEVED"
    PARTIAL = "PARTIAL"
    NOT_ACHIEVED = "NOT_ACHIEVED"
    UNVERIFIED = "UNVERIFIED"


class WorkflowOutcome(str, Enum):
    """Adapted from the upstream Strands "trajectory" evaluator role.

    Public OneShot vocabulary is "workflow" everywhere; the mapping is
    recorded only as adapter metadata on WorkflowEvaluator.
    """

    HONORED = "HONORED"
    HONORED_WITH_GAPS = "HONORED_WITH_GAPS"
    VIOLATED = "VIOLATED"
    UNVERIFIED = "UNVERIFIED"


class OutputQualityGrade(str, Enum):
    PASS = "PASS"
    MARGINAL = "MARGINAL"
    FAIL = "FAIL"
    UNVERIFIED = "UNVERIFIED"


class EvaluationStatus(str, Enum):
    COMPLETED = "COMPLETED"
    PARTIAL = "PARTIAL"
    CANCELLED = "CANCELLED"
    TIMED_OUT = "TIMED_OUT"
    FAILED = "FAILED"


class RecommendedDisposition(str, Enum):
    """Approved disposition set — do NOT extend without spec change."""

    READY_FOR_APPROVAL = "READY_FOR_APPROVAL"
    CORRECTION_REQUIRED = "CORRECTION_REQUIRED"
    MORE_EVIDENCE_REQUIRED = "MORE_EVIDENCE_REQUIRED"
    BLOCKED = "BLOCKED"
    CANCELLED = "CANCELLED"


class EvidenceClass(str, Enum):
    """Observation classes. MultimodalObservation is not upgraded."""

    DETERMINISTIC = "DETERMINISTIC"
    MODEL_DERIVED_TEXT_OBSERVATION = "MODEL_DERIVED_TEXT_OBSERVATION"
    MODEL_DERIVED_VISUAL_OBSERVATION = "MODEL_DERIVED_VISUAL_OBSERVATION"
    STRUCTURED_ARTIFACT = "STRUCTURED_ARTIFACT"


class MultimodalReadiness(str, Enum):
    """Typed readiness states for the optional Cosmos adapter."""

    NOT_INSTALLED = "NOT_INSTALLED"
    CONFIG_REQUIRED = "CONFIG_REQUIRED"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    HARDWARE_UNSUPPORTED = "HARDWARE_UNSUPPORTED"
    READY = "READY"


# ---------------------------------------------------------------------------
# Value types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EvaluationItem:
    """One requirement or component instance.

    Deliberately minimal — the middleware never accepts credentials,
    executable paths, or secrets.
    """

    itemId: str
    kind: str  # "requirement" | "component" | "assertion"
    summary: str
    required: bool = True
    dependsOn: tuple[str, ...] = ()
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class RequirementResult:
    itemId: str
    status: RequirementStatus
    evidence: tuple[str, ...] = ()
    limitations: tuple[str, ...] = ()
    reasonCode: str | None = None


@dataclass(frozen=True)
class ComponentResult:
    componentId: str
    status: ComponentStatus
    evidence: tuple[str, ...] = ()
    limitations: tuple[str, ...] = ()


@dataclass(frozen=True)
class AssertionResult:
    assertionId: str
    passed: bool
    detail: str = ""
    evidence: tuple[str, ...] = ()


@dataclass(frozen=True)
class GoalSuccessResult:
    outcome: GoalOutcome
    modelDerivedScore: float | None = None
    detail: str = ""
    limitations: tuple[str, ...] = ()


@dataclass(frozen=True)
class OutputQualityResult:
    grade: OutputQualityGrade
    modelDerivedScore: float | None = None
    rubricScores: Mapping[str, float] = field(default_factory=dict)
    detail: str = ""
    limitations: tuple[str, ...] = ()


@dataclass(frozen=True)
class WorkflowResult:
    """Public-facing name; internally references the Strands trajectory role."""

    outcome: WorkflowOutcome
    completionRatio: float
    honoredEdges: tuple[tuple[str, str], ...] = ()
    violatedEdges: tuple[tuple[str, str], ...] = ()
    unexecutedPhases: tuple[str, ...] = ()
    limitations: tuple[str, ...] = ()


@dataclass(frozen=True)
class EvaluatorError:
    evaluatorName: str
    code: str
    message: str


@dataclass(frozen=True)
class EvidenceReference:
    referenceId: str
    kind: str
    summary: str
    evidenceClass: EvidenceClass = EvidenceClass.DETERMINISTIC


@dataclass(frozen=True)
class MultimodalObservation:
    """Provider-neutral visual observation.

    ALWAYS classified MODEL_DERIVED_VISUAL_OBSERVATION.
    Never a confirmed fact/component/requirement/root cause.
    """

    observationId: str
    modality: str  # "image" | "video" | "screenshot" | "recording" | "diagram"
    summary: str
    providerLabel: str = "unknown"
    evidenceClass: EvidenceClass = EvidenceClass.MODEL_DERIVED_VISUAL_OBSERVATION

    def __post_init__(self) -> None:  # pragma: no cover - trivial
        # Freeze the classification. The dataclass is frozen so we
        # cannot mutate; we only assert the invariant.
        if self.evidenceClass is not EvidenceClass.MODEL_DERIVED_VISUAL_OBSERVATION:
            raise ValueError(
                "MultimodalObservation.evidenceClass must be "
                "MODEL_DERIVED_VISUAL_OBSERVATION"
            )


# ---------------------------------------------------------------------------
# Expected-workflow DAG grammar
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WorkflowPhase:
    phaseId: str
    displayName: str


@dataclass(frozen=True)
class WorkflowEdge:
    """Directed prerequisite edge — `before` must execute before `after`.

    Loops are forbidden (see WorkflowEvaluator.assert_acyclic).
    """

    before: str
    after: str


@dataclass(frozen=True)
class ExpectedWorkflow:
    """DAG canonical model. The middleware also emits an ordered projection
    for readable receipts (see WorkflowEvaluator._ordered_projection).
    """

    phases: tuple[WorkflowPhase, ...]
    edges: tuple[WorkflowEdge, ...]
    allowedInterleavings: tuple[tuple[str, ...], ...] = ()


@dataclass(frozen=True)
class ActualWorkflowStep:
    phaseId: str
    at: str  # ISO-8601 timestamp
    detail: str = ""


# ---------------------------------------------------------------------------
# Evaluator configuration & request
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EvaluatorConfiguration:
    """Turn evaluators on/off. Deterministic evaluators default ON;
    model-based evaluators default OFF (offline-mandatory).
    """

    runRequirementCoverage: bool = True
    runGoalSuccess: bool = True
    runOutputQuality: bool = True
    runWorkflow: bool = True
    # Model-based evaluators require an explicit opt-in.
    allowModelBasedGoal: bool = False
    allowModelBasedOutput: bool = False


@dataclass(frozen=True)
class ExplicitAssertion:
    assertionId: str
    description: str
    predicateKey: str  # Handled by deterministic assertion library
    predicateArgs: Mapping[str, Any] = field(default_factory=dict)
    required: bool = True


@dataclass(frozen=True)
class EvaluationRequest:
    """The typed request accepted by EvaluationMiddleware.evaluate.

    Notes on what the request MUST NOT accept:
      - unrestricted credentials
      - commands / executable paths
      - package names to install
      - raw secrets
    Anything resembling a shell command is passed on strictly as
    opaque string data used for evidence description.
    """

    evaluationId: str
    targetId: str
    buildId: str | None = None
    planId: str | None = None
    requestedGoal: str = ""
    requirements: tuple[EvaluationItem, ...] = ()
    explicitAssertions: tuple[ExplicitAssertion, ...] = ()
    expectedComponents: tuple[EvaluationItem, ...] = ()
    observedComponents: tuple[str, ...] = ()
    buildOutput: str = ""
    evidenceReferences: tuple[EvidenceReference, ...] = ()
    expectedWorkflow: ExpectedWorkflow | None = None
    actualWorkflow: tuple[ActualWorkflowStep, ...] = ()
    optionalMultimodalEvidence: tuple[MultimodalObservation, ...] = ()
    evaluatorConfiguration: EvaluatorConfiguration = EvaluatorConfiguration()
    timeoutSeconds: float | None = None
    # A cancellation "token" is intentionally a callable-based sentinel
    # rather than an object hierarchy — simpler contract.
    cancellationState: Callable[[], bool] | None = None


# ---------------------------------------------------------------------------
# Evaluator result envelope
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EvaluatorResult:
    """Envelope returned by a single evaluator.

    Exactly one of (payload, error) is set. `timedOut` and `cancelled`
    are orthogonal to `error` per INV-3.
    """

    evaluatorName: str
    payload: Any | None = None
    error: EvaluatorError | None = None
    timedOut: bool = False
    cancelled: bool = False


# ---------------------------------------------------------------------------
# Evaluator protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class Evaluator(Protocol):
    """Every evaluator implements this async protocol."""

    name: str
    upstreamStrandsRole: str  # adapter metadata only

    async def evaluate(self, request: EvaluationRequest) -> EvaluatorResult: ...


# ---------------------------------------------------------------------------
# Multimodal adapter protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class MultimodalEvidenceAdapter(Protocol):
    """Provider-neutral multimodal adapter.

    Implementations:
      - DeterministicMultimodalEvidenceAdapter (offline, mandatory)
      - CosmosMultimodalEvidenceAdapter (boundary only)
    """

    providerLabel: str

    def readiness(self) -> MultimodalReadiness: ...

    async def describe(
        self, referenceId: str
    ) -> Optional[MultimodalObservation]: ...


# ---------------------------------------------------------------------------
# Middleware facade type — implementations live in middleware.py
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EvaluationReceipt:
    evaluationId: str
    targetId: str
    buildId: str | None
    planId: str | None
    startedAt: str
    completedAt: str
    evaluationStatus: EvaluationStatus
    # counts
    requiredComponentCount: int
    observedComponentCount: int
    satisfiedComponentCount: int
    partialComponentCount: int
    missingComponentCount: int
    unverifiedComponentCount: int
    blockedComponentCount: int
    # per-item results
    requirementResults: tuple[RequirementResult, ...]
    componentResults: tuple[ComponentResult, ...]
    assertionResults: tuple[AssertionResult, ...]
    goalSuccessResult: GoalSuccessResult | None
    outputQualityResult: OutputQualityResult | None
    workflowResult: WorkflowResult | None
    # gap lists
    missingComponents: tuple[str, ...]
    missingRequirements: tuple[str, ...]
    blockedRequirements: tuple[str, ...]
    # provenance
    evidenceReferences: tuple[EvidenceReference, ...]
    multimodalObservations: tuple[MultimodalObservation, ...]
    # ratios
    requirementCoverageRatio: float
    verifiedCoverageRatio: float
    missingRequirementRatio: float
    componentCoverageRatio: float
    workflowCompletionRatio: float
    # bookkeeping
    limitations: tuple[str, ...]
    evaluatorErrors: tuple[EvaluatorError, ...]
    cancellationStatus: str  # "NONE" | "REQUESTED" | "OBSERVED"
    timeoutStatus: str  # "NONE" | "ELAPSED"
    recommendedDisposition: RecommendedDisposition
