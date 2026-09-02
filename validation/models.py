from __future__ import annotations
from typing import Any, Annotated, Literal
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, model_validator, field_validator

class StrictModel(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True,populate_by_name=True)
NonEmptyStr=Annotated[str,StringConstraints(min_length=1)]
Sha256Str=Annotated[str,StringConstraints(pattern=r'^[a-f0-9]{64}$')]
def _unique(v:list[str])->list[str]:
    if len(v)!=len(set(v)): raise ValueError('items must be unique')
    return v
UniqueStrList=Annotated[list[NonEmptyStr],AfterValidator(_unique)]
NonEmptyUniqueStrList=Annotated[list[NonEmptyStr],Field(min_length=1),AfterValidator(_unique)]

class EvidenceRef(StrictModel): evidence_id:NonEmptyStr; source:NonEmptyStr; statement:NonEmptyStr; provenance:NonEmptyStr
class RootCause(StrictModel): issue:NonEmptyStr; expected:NonEmptyStr; actual:NonEmptyStr; evidence_ids:UniqueStrList; required_correction:NonEmptyStr; recheck_target:NonEmptyStr
class PromptContext(StrictModel): context_id:NonEmptyStr; statement:NonEmptyStr
class Prompt(StrictModel): prompt_id:NonEmptyStr; intent:NonEmptyStr; requested_outcome:NonEmptyStr; context:list[PromptContext]; research_direction:NonEmptyUniqueStrList
class SuccessDefinition(StrictModel): success_criteria_ids:NonEmptyUniqueStrList; success_meaning:NonEmptyStr; evidence_ids:UniqueStrList
class Researcher(StrictModel): researcher_id:NonEmptyStr; prompt_id:NonEmptyStr; plan_id:NonEmptyStr; schema_id:NonEmptyStr; fixture_id:NonEmptyStr; goal_id:NonEmptyStr; validation_id:NonEmptyStr; requirement_ids:UniqueStrList; evidence:list[EvidenceRef]; success_definition:SuccessDefinition
class Requirement(StrictModel): requirement_id:NonEmptyStr; statement:NonEmptyStr; evidence_ids:UniqueStrList
class Dependency(StrictModel): dependency_id:NonEmptyStr; description:NonEmptyStr; required_by:UniqueStrList
class PlanStep(StrictModel): step_id:NonEmptyStr; description:NonEmptyStr; responsibility:NonEmptyStr; depends_on:UniqueStrList; requirement_refs:UniqueStrList; goal_refs:UniqueStrList; fixture_refs:UniqueStrList; schema_refs:UniqueStrList
class RevisionEvidence(StrictModel): revision:Annotated[int,Field(ge=1)]; affected_area:NonEmptyStr; reason:NonEmptyStr; audit_finding_id:NonEmptyStr
class Plan(StrictModel): plan_id:NonEmptyStr; researcher_id:NonEmptyStr; requirements:list[Requirement]; dependencies:list[Dependency]; steps:Annotated[list[PlanStep],Field(min_length=1)]; revision:Annotated[int,Field(ge=1)]; revision_evidence:list[RevisionEvidence]
class SchemaArtifact(StrictModel): schema_id:NonEmptyStr; researcher_id:NonEmptyStr; target:NonEmptyStr; schema_document:dict[str,Any]; evidence_ids:UniqueStrList
class SuccessCriterion(StrictModel): criterion_id:NonEmptyStr; statement:NonEmptyStr; measurement:NonEmptyStr; expected_result:NonEmptyStr; evidence_ids:UniqueStrList
class Goal(StrictModel): goal_id:NonEmptyStr; researcher_id:NonEmptyStr; objective:NonEmptyStr; success_meaning:NonEmptyStr; success_criteria:Annotated[list[SuccessCriterion],Field(min_length=1)]
class PlanAssertion(StrictModel): assertion_id:NonEmptyStr; operator:Literal['exists','equals','contains','matchesSchema','references','edgeExists','allFilesSpecified']; target:NonEmptyStr; expected:Any=None; evidence_ids:UniqueStrList
class Fixture(StrictModel): fixture_id:NonEmptyStr; researcher_id:NonEmptyStr; plan_assertions:Annotated[list[PlanAssertion],Field(min_length=1)]
class SchemaValidationDefinition(StrictModel): plan_id:NonEmptyStr; schema_id:NonEmptyStr
class FixtureValidationDefinition(StrictModel): plan_id:NonEmptyStr; fixture_id:NonEmptyStr; assertion_ids:UniqueStrList
class GoalValidationDefinition(StrictModel): plan_id:NonEmptyStr; goal_id:NonEmptyStr; criterion_ids:UniqueStrList
class ValidationDefinition(StrictModel): validation_id:NonEmptyStr; researcher_id:NonEmptyStr; plan_id:NonEmptyStr; schema_validation:SchemaValidationDefinition; fixture_validation:FixtureValidationDefinition; goal_validation:GoalValidationDefinition
class AuditFinding(StrictModel): finding_id:NonEmptyStr; area:NonEmptyStr; finding:NonEmptyStr; affected_plan_refs:UniqueStrList; evidence_ids:UniqueStrList; required_refinement:NonEmptyStr
class Audit(StrictModel): audit_id:NonEmptyStr; researcher_id:NonEmptyStr; plan_id:NonEmptyStr; reviewed_areas:UniqueStrList; findings:list[AuditFinding]
class ResolvedGap(StrictModel): gap_id:NonEmptyStr; affected_branch:NonEmptyStr; issue:NonEmptyStr; evidence_ids:UniqueStrList; required_correction:NonEmptyStr; expected_resolved_state:NonEmptyStr; resolution_evidence:NonEmptyStr
class GapAnalysis(StrictModel):
    plan_id:NonEmptyStr; result:Literal['PASSED','ROOT_CAUSE']; resolved_gaps:list[ResolvedGap]; gap_0:bool; root_cause:RootCause|None=None
    @model_validator(mode='after')
    def coherent(self):
        if self.result=='PASSED' and (not self.gap_0 or self.root_cause is not None): raise ValueError('PASSED Gap Analysis requires gap_0=true and no root_cause')
        if self.result=='ROOT_CAUSE' and (self.gap_0 or self.root_cause is None): raise ValueError('ROOT_CAUSE Gap Analysis requires gap_0=false and root_cause')
        return self
class EvaluationEvidence(StrictModel): check_id:NonEmptyStr; subject:NonEmptyStr; finding:NonEmptyStr; evidence_ids:UniqueStrList
class Evaluation(StrictModel):
    plan_id:NonEmptyStr; result:Literal['PASSED','ROOT_CAUSE']; evidence:Annotated[list[EvaluationEvidence],Field(min_length=1)]; root_cause:RootCause|None=None
    @model_validator(mode='after')
    def coherent(self):
        if self.result=='PASSED' and self.root_cause is not None: raise ValueError('PASSED Evaluation has no root_cause')
        if self.result=='ROOT_CAUSE' and self.root_cause is None: raise ValueError('ROOT_CAUSE Evaluation requires root_cause')
        return self
class SchemaValidationResult(StrictModel): plan_id:NonEmptyStr; schema_id:NonEmptyStr; result:Literal['VALID','NOT_VALID']; evidence:list[EvidenceRef]
class AssertionResult(StrictModel): assertion_id:NonEmptyStr; expected:Any=None; actual:Any=None; satisfied:bool
class FixtureValidationResult(StrictModel): plan_id:NonEmptyStr; fixture_id:NonEmptyStr; assertion_results:list[AssertionResult]; result:Literal['VALID','NOT_VALID']; evidence:list[EvidenceRef]
class CriterionResult(StrictModel): criterion_id:NonEmptyStr; mapped_plan_refs:UniqueStrList; satisfied:bool
class GoalValidationResult(StrictModel): plan_id:NonEmptyStr; goal_id:NonEmptyStr; criterion_results:list[CriterionResult]; result:Literal['VALID','NOT_VALID']; evidence:list[EvidenceRef]
class TripleValidation(StrictModel): plan_id:NonEmptyStr; validation_id:NonEmptyStr; schema_validation:SchemaValidationResult; fixture_validation:FixtureValidationResult; goal_validation:GoalValidationResult; all_valid:bool
class ConfirmedCore(StrictModel): researcher:Researcher; plan:Plan; schema_artifact:SchemaArtifact; fixture:Fixture; goal:Goal; validation:ValidationDefinition; audit:Audit; gap_analysis:GapAnalysis; evaluation:Evaluation; triple_validation:TripleValidation
class ConfirmedPackage(StrictModel): confirmed:Literal[True]; core:ConfirmedCore
class HashProof(StrictModel): canonicalization_id:Literal['oneshot-jcs-rfc8785-v1']; algorithm:Literal['sha256']; created_hash:Sha256Str; recomputed_hash:Sha256Str; equal:bool
class GraphNode(StrictModel): id:NonEmptyStr; kind:Literal['source','processor','validator','gate','proof','terminal']
class GraphEdge(StrictModel): from_:NonEmptyStr=Field(alias='from'); to:NonEmptyStr; artifact:NonEmptyStr
class ArtifactOwnership(StrictModel): artifact:NonEmptyStr; owner:NonEmptyStr; consumers:UniqueStrList
class ParallelGroup(StrictModel): group_id:NonEmptyStr; members:UniqueStrList; join:NonEmptyStr
class WorkflowAgent(StrictModel):
    id: NonEmptyStr
    type: Literal['SequentialAgent', 'LoopAgent', 'ParallelAgent']
    members: UniqueStrList
    exit: NonEmptyStr | None = None
    join: NonEmptyStr | None = None
    @field_validator('exit', 'join')
    @classmethod
    def validate_exit_join(cls, v, info):
        if v is None: return v
        agent_type = info.data.get('type')
        if agent_type == 'SequentialAgent' and (info.field_name == 'exit' or info.field_name == 'join'):
            raise ValueError(f'SequentialAgent cannot have {info.field_name}')
        if agent_type == 'LoopAgent' and info.field_name == 'join':
            raise ValueError('LoopAgent cannot have join')
        if agent_type == 'ParallelAgent' and info.field_name == 'exit':
            raise ValueError('ParallelAgent cannot have exit')
        return v
    @model_validator(mode='after')
    def validate_required_fields(self):
        if self.type == 'LoopAgent' and self.exit is None:
            raise ValueError('LoopAgent must have exit')
        if self.type == 'ParallelAgent' and self.join is None:
            raise ValueError('ParallelAgent must have join')
        return self
class WorkflowGraph(StrictModel): workflow_id:Literal['oneshot-canonical-workflow']; version:NonEmptyStr; nodes:list[GraphNode]; edges:list[GraphEdge]; artifact_ownership:list[ArtifactOwnership]; parallel_groups:list[ParallelGroup]; workflow_agents:list[WorkflowAgent]
class ContractRegistryEntry(StrictModel): contract_id:NonEmptyStr; version:NonEmptyStr; artifact_type:NonEmptyStr; schema_path:NonEmptyStr; schema_digest:Sha256Str; producer:NonEmptyStr; consumers:UniqueStrList
class ContractRegistry(StrictModel): registry_id:Literal['oneshot-contract-registry']; registry_version:NonEmptyStr; contracts:list[ContractRegistryEntry]

class ExecutionAuthorizationModel(StrictModel):
    execution_id: NonEmptyStr
    execution_root: str | None = None
    permitted_operations: list[str] | None = None
    protected_paths: list[str] | None = None
    timeout_seconds: Annotated[int, Field(ge=1)] = 300
    memory_limit_mb: Annotated[int, Field(ge=1)] = 512
    cpu_limit: Annotated[float, Field(gt=0)] = 1.0
    pid_limit: Annotated[int, Field(ge=1)] = 64
    network_policy: Literal['DENY_ALL', 'ALLOW_SPECIFIC'] = 'DENY_ALL'
    environment_allowlist: list[str] = Field(default_factory=list)
    max_output_bytes: Annotated[int, Field(ge=1)] = 1048576
    max_files_changed: Annotated[int, Field(ge=1)] = 100
    max_total_bytes_written: Annotated[int, Field(ge=1)] = 10485760

class SandboxExecutionInputModel(StrictModel):
    confirmed_package: ConfirmedPackage
    hash: Sha256Str
    execution_authorization: ExecutionAuthorizationModel | None = None

class FileChangeEvidenceModel(StrictModel):
    path: NonEmptyStr
    action: Literal['created', 'modified', 'deleted']
    bytes: Annotated[int, Field(ge=0)]

class ResourceUsageEvidenceModel(StrictModel):
    duration_ms: Annotated[float, Field(ge=0)]
    peak_memory_mb: Annotated[float, Field(ge=0)] | None = None
    cpu_time_ms: Annotated[float, Field(ge=0)] | None = None

class TimeoutEvidenceModel(StrictModel):
    timed_out: bool
    limit_seconds: Annotated[float, Field(ge=0)]
    elapsed_seconds: Annotated[float, Field(ge=0)]

class CleanupResultModel(StrictModel):
    workspace_cleaned: bool
    processes_terminated: bool

class ExecutionEvidenceModel(StrictModel):
    execution_id: NonEmptyStr
    sandbox_id: NonEmptyStr
    confirmed_package_hash: Sha256Str
    started_at: NonEmptyStr
    completed_at: NonEmptyStr
    commands: list[str]
    exit_codes: list[int]
    stdout_refs: list[str]
    stderr_refs: list[str]
    file_changes: list[FileChangeEvidenceModel]
    bytes_written: Annotated[int, Field(ge=0)]
    resource_usage: ResourceUsageEvidenceModel
    timeout_evidence: TimeoutEvidenceModel | None = None
    environment_allowlist_used: list[str]
    network_policy_used: NonEmptyStr
    cleanup_result: CleanupResultModel
    hash_sandbox: Sha256Str

class ResearchRequestModel(StrictModel):
    request_id: NonEmptyStr
    issue: NonEmptyStr
    why_research_is_required: NonEmptyStr
    evidence_ids: UniqueStrList
    missing_information: UniqueStrList
    execution_id: NonEmptyStr

