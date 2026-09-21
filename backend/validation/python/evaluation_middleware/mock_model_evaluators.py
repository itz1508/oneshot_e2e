"""
Model-based evaluator MOCKS — offline, deterministic, no live model.

Two mock evaluators exist ONLY to prove the boundary discipline in
tests. Neither reaches the network; each returns a scripted payload.

INV-2: even a MockGoalEvaluator score of 1.0 MUST NOT override a
deterministic MISSING requirement in the middleware's disposition
logic. This is proven in tests/test_middleware_disposition.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping

from .contracts import (
    EvaluationRequest,
    Evaluator,
    EvaluatorError,
    EvaluatorResult,
    GoalOutcome,
    GoalSuccessResult,
    OutputQualityGrade,
    OutputQualityResult,
    RequirementResult,
)


@dataclass
class MockGoalEvaluator:
    """Returns a scripted GoalSuccessResult. No network, no model call."""

    name: str = "MockGoalEvaluator"
    upstreamStrandsRole: str = (
        "mock-of:strands.harness.evals.goal_success_rate_evaluator"
    )
    scriptedOutcome: GoalOutcome = GoalOutcome.ACHIEVED
    scriptedScore: float = 1.0

    async def evaluate(
        self,
        request: EvaluationRequest,
        *,
        requirement_results: tuple[RequirementResult, ...] | None = None,
    ) -> EvaluatorResult:
        _ = requirement_results
        return EvaluatorResult(
            evaluatorName=self.name,
            payload=GoalSuccessResult(
                outcome=self.scriptedOutcome,
                modelDerivedScore=self.scriptedScore,
                detail="scripted mock — never a live model",
                limitations=(
                    "MODEL_DERIVED_TEXT_OBSERVATION — deterministic evaluator "
                    "must still take precedence",
                ),
            ),
        )


@dataclass
class MockOutputEvaluator:
    """Returns a scripted OutputQualityResult. No network."""

    name: str = "MockOutputEvaluator"
    upstreamStrandsRole: str = "mock-of:strands.harness.evals.output_evaluator"
    scriptedGrade: OutputQualityGrade = OutputQualityGrade.PASS
    scriptedScore: float = 1.0
    scriptedRubric: Mapping[str, float] = field(
        default_factory=lambda: {
            "completeness": 1.0,
            "correctness": 1.0,
            "contract_compliance": 1.0,
            "evidence_support": 1.0,
            "clarity": 1.0,
            "requested_format": 1.0,
        }
    )

    async def evaluate(
        self,
        request: EvaluationRequest,
        *,
        requirement_results: tuple[RequirementResult, ...] | None = None,
    ) -> EvaluatorResult:
        _ = requirement_results
        return EvaluatorResult(
            evaluatorName=self.name,
            payload=OutputQualityResult(
                grade=self.scriptedGrade,
                modelDerivedScore=self.scriptedScore,
                rubricScores=dict(self.scriptedRubric),
                detail="scripted mock — never a live model",
                limitations=(
                    "MODEL_DERIVED_TEXT_OBSERVATION — deterministic evaluator "
                    "must still take precedence",
                ),
            ),
        )


@dataclass
class FailingMockEvaluator:
    """Test fixture: always returns an EvaluatorError. Used to prove
    INV-3 — a failing evaluator does not erase other evaluator results."""

    name: str = "FailingMockEvaluator"
    upstreamStrandsRole: str = "test-fixture:always-fails"

    async def evaluate(
        self,
        request: EvaluationRequest,
        *,
        requirement_results: tuple[RequirementResult, ...] | None = None,
    ) -> EvaluatorResult:
        _ = request, requirement_results
        return EvaluatorResult(
            evaluatorName=self.name,
            error=EvaluatorError(
                evaluatorName=self.name,
                code="TEST_INDUCED",
                message="intentional test failure",
            ),
        )
