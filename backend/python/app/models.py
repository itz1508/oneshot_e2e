from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ReasoningTask(str, Enum):
    RESEARCHER = "researcher"
    PLANNER = "planner"
    GAP_ANALYSIS = "gap-analysis"
    EVALUATION = "evaluation"
    CRITIC = "critic"


class EvidenceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str
    content: str
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class PlanTask(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    action: str
    required: bool = True


class Plan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    objective: str
    status: str
    tasks: list[PlanTask]


class ReasoningRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str = Field(min_length=1)
    task: ReasoningTask

    goal: str = Field(min_length=1)

    constraints: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)

    plan: Plan | None = None


class Finding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    severity: str
    message: str


class ReasoningResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str
    task: ReasoningTask

    success: bool

    confidence: float = Field(ge=0.0, le=1.0)

    analysis: list[str]
    findings: list[Finding]
    risks: list[str]
    missing_evidence: list[str]

    recommendation: str
