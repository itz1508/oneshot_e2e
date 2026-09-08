export type {
  PipelineStage,
  StageHandoff,
  StageJobData,
  StageProgress,
  GateAction,
  ConfirmPlanInput,
  ConfirmPlanResult,
  PlanReviewEdits,
} from "./types.js";

export {
  pipelineQueue,
  PIPELINE_QUEUE,
  stageJobId,
  enqueueStage,
  closePipelineQueue,
  getSharedRedis,
  getProducerRedis,
} from "./queue.js";

export type { PipelineContext, CapturedProvider } from "./context.js";
export {
  loadPrompt,
  loadProvider,
  loadResearchBundle,
  loadPlan,
  loadAudit,
  loadGapAnalysis,
  loadEvaluation,
  loadTripleValidation,
  loadConfirmedPackage,
  loadHashProof,
  saveArtifact,
} from "./context.js";

export type { StageServices } from "./processors.js";
export {
  runResearcherStage,
  runPlannerStage,
  runRefactorStage,
  runGapAnalysisStage,
  runEvaluationStage,
  runTripleValidationStage,
  runConfirmationStage,
  runHashStage,
  runBuildStage,
} from "./processors.js";

export { createPipelineWorker } from "./worker.js";
export { confirmPlan } from "./confirm-plan.js";
export {
  createPipelineQueueEvents,
  closePipelineQueueEvents,
} from "./events.js";
export { PipelineHistory } from "./history.js";
export type {
  PipelineHistoryEvent,
  PipelineHistoryEventType,
} from "./history.js";
export { PipelineIdempotency } from "./idempotency.js";
export { PipelineFaultController } from "./fault-controller.js";
export { runStage } from "./run-stage.js";
export type {
  RunStageResult,
  StageHistoryEvent,
  StageHistoryEventType,
  StageHistoryLogger,
  StageExecutionLock,
  StageFaultInjector,
} from "./run-stage.js";
export { faultsEnabled, getFaultConfig } from "./faults.js";
export type { FaultStage, FaultMode, FaultConfig } from "./faults.js";

// Durable execution model
export { advance, refine, terminal, isStageOutcome } from "./stage-outcome.js";
export type { StageOutcome, PipelineIssue } from "./stage-outcome.js";
export { PipelineCheckpoints } from "./checkpoints.js";
export type {
  RedisCheckpointClient,
  StageIdentity,
  TransitionState,
  TerminalState,
  TerminalIssue,
} from "./checkpoints.js";
export {
  isIterativeStage,
  stageIteration,
  getCurrentResearchRevision,
  incrementResearchRevision,
  researchRevisionKey,
} from "./stage-scope.js";
export { applyTransition } from "./apply-transition.js";
export type {
  TransitionQueue,
  TransitionServices,
} from "./apply-transition.js";
export { reconcileStage } from "./reconcile.js";
export type { ReconcileInput, ReconcileResult } from "./reconcile.js";
export { createTransitionServices } from "./transition-services.js";
export type {
  TransitionServicesInput,
  TransitionServicesHandle,
} from "./transition-services.js";
