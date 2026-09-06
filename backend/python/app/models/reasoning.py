from pydantic import BaseModel, Field


class EvidenceItem(BaseModel):
    source: str
    content: str
    confidence: float = Field(ge=0.0, le=1.0)


class ReasoningRequest(BaseModel):
    run_id: str = Field(min_length=1)
    task: str = Field(
        pattern="^(researcher|planner|gap-analysis|evaluation|critic)$"
    )
    goal: str = Field(min_length=1)
    constraints: list[str]
    evidence: list[EvidenceItem]
    plan: dict | None = None


class Finding(BaseModel):
    code: str
    severity: str
    message: str


class ReasoningResponse(BaseModel):
    run_id: str
    task: str
    success: bool
    confidence: float = Field(ge=0.0, le=1.0)
    analysis: list[str]
    findings: list[Finding]
    risks: list[str]
    missing_evidence: list[str]
    recommendation: str
