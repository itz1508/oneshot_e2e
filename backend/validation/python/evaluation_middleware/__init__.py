"""OneShot evaluation-middleware public surface.

FRAMEWORK_PROOF_ONLY. Deterministic-first. Provider-neutral.
No live model runtime. No network. No Cosmos install.

Public names (per approved answer to Q1):
"""

from .contracts import (
    AssertionResult,
    ActualWorkflowStep,
    ComponentResult,
    ComponentStatus,
    EvaluationItem,
    EvaluationReceipt,
    EvaluationRequest,
    EvaluationStatus,
    Evaluator,
    EvaluatorConfiguration,
    EvaluatorError,
    EvaluatorResult,
    EvidenceClass,
    EvidenceReference,
    ExpectedWorkflow,
    ExplicitAssertion,
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
    WorkflowEdge,
    WorkflowOutcome,
    WorkflowPhase,
    WorkflowResult,
)
from .evaluators import (
    DeterministicGoalEvaluator,
    DeterministicOutputEvaluator,
    DeterministicRequirementEvaluator,
    DeterministicWorkflowEvaluator,
    compute_component_results,
)
from .mock_model_evaluators import (
    FailingMockEvaluator,
    MockGoalEvaluator,
    MockOutputEvaluator,
)
from .middleware import EvaluationMiddleware
from .predicates import PREDICATE_REGISTRY, evaluate_assertion

# Public evaluator role aliases (spec-approved names)
GoalEvaluator = DeterministicGoalEvaluator
RequirementEvaluator = DeterministicRequirementEvaluator
OutputEvaluator = DeterministicOutputEvaluator
WorkflowEvaluator = DeterministicWorkflowEvaluator

# EvaluationResult = merged intermediate result (per-run) — expose the
# receipt as the canonical merged view.
EvaluationResult = EvaluationReceipt

__all__ = [
    # roles (public names)
    "GoalEvaluator",
    "RequirementEvaluator",
    "OutputEvaluator",
    "WorkflowEvaluator",
    "EvaluationMiddleware",
    # value types
    "EvaluatorResult",
    "EvaluationResult",
    "EvaluationReceipt",
    "EvaluationItem",
    "MultimodalObservation",
    # supporting types
    "AssertionResult",
    "ActualWorkflowStep",
    "ComponentResult",
    "ComponentStatus",
    "EvaluationRequest",
    "EvaluationStatus",
    "Evaluator",
    "EvaluatorConfiguration",
    "EvaluatorError",
    "EvidenceClass",
    "EvidenceReference",
    "ExpectedWorkflow",
    "ExplicitAssertion",
    "GoalOutcome",
    "GoalSuccessResult",
    "MultimodalEvidenceAdapter",
    "MultimodalReadiness",
    "OutputQualityGrade",
    "OutputQualityResult",
    "RecommendedDisposition",
    "RequirementResult",
    "RequirementStatus",
    "WorkflowEdge",
    "WorkflowOutcome",
    "WorkflowPhase",
    "WorkflowResult",
    # deterministic implementations
    "DeterministicGoalEvaluator",
    "DeterministicOutputEvaluator",
    "DeterministicRequirementEvaluator",
    "DeterministicWorkflowEvaluator",
    "compute_component_results",
    # mock model evaluators (offline, tests only)
    "FailingMockEvaluator",
    "MockGoalEvaluator",
    "MockOutputEvaluator",
    # predicates
    "PREDICATE_REGISTRY",
    "evaluate_assertion",
]
