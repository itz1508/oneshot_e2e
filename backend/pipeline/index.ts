export type {
  PipelineStage,
  StageHandoff,
  StageJobData,
  StageProgress,
  GateAction,
  ConfirmPlanInput,
  ConfirmPlanResult,
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
export { createPipelineQueueEvents, closePipelineQueueEvents } from "./events.js";
