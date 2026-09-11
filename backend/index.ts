import "./environment.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ProcessingEventBus } from "./runtime/event-bus.js";
import { RunRepository } from "./runtime/run-repository.js";
import { FileArtifactStore } from "./runtime/artifact-store.js";
import { AppendOnlyProcessingEventStore } from "./task/event/event-store.js";
import { CheckpointStore } from "./task/checkpoint/checkpoint-store.js";
import { TaskManagement } from "./task/task-management.js";
import { ConversationStore } from "./intent/conversation-store.js";
import { IntentCollectionService } from "./intent/intent-collection.js";
import { PythonBridge } from "./validation/python-bridge.js";
import { ValidationLanePool } from "./validation/validation-lane-pool.js";
import { DeterministicValidationRuntime } from "./validation/deterministic-validation.js";
import { CanonicalContractSkill } from "./skills/canonical-contract-skill.js";
import { createSkillSystem } from "./skills/bootstrap.js";
import {
  BullMQRunQueue,
  executeRunJob,
  RUN_QUEUE_NAME,
  type RunQueueDeps,
} from "./runtime/queue.js";
import { ResearcherWorkflow } from "./agents/researcher/workflow.js";
import { PlannerWorkflow } from "./agents/planner/workflow.js";
import { RefactorWorkflow } from "./agents/refactor/workflow.js";
import { GapAnalysisWorkflow } from "./agents/gap-analysis/workflow.js";
import { EvaluationWorkflow } from "./agents/evaluation/workflow.js";
import { BuilderWorkflow } from "./agents/builder/workflow.js";
import { TripleValidationWorkflow } from "./workflow/triple-validation.js";
import { ConfirmationWorkflow } from "./workflow/confirmation.js";
import { HashWorkflow } from "./workflow/hash.js";
import {
  closePipelineQueueEvents,
  confirmPlan,
  createPipelineQueueEvents,
  createPipelineWorker,
  enqueueStage,
  pipelineQueue,
  saveArtifact,
  type StageServices,
  PipelineHistory,
  createTransitionServices,
  reconcileStage,
} from "./pipeline/index.js";
import { getSharedRedis } from "./runtime/redis-connection.js";
import type { QueueEvents } from "bullmq";
import { WorkflowRuntime } from "./runtime/workflow-runtime.js";
import { SandboxService } from "./sandbox/sandbox-service.js";
import { HardenedProcessRunner } from "./sandbox/runner/process-runner.js";
import { ContainerSandboxRunner } from "./sandbox/runner/container-runner.js";
import { TargetWorkspaceService } from "./runtime/target-workspace.js";
import { startHttpServer, type RuntimeInfo } from "./server/http-server.js";
import { getRuntimePaths, ensureRuntimeDirectories } from "./runtime/runtime-config.js";
import { createPythonReasoner } from "./reasoning/python-client.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const projectRoot = process.env.ONESHOT_ROOT || process.cwd();

// --- Runtime Directory Initialization ---
const runtimePaths = getRuntimePaths(projectRoot);
ensureRuntimeDirectories(runtimePaths);

// --- Target Workspace (§11–12) ---
// Explicitly-selected target project workspace. Uploads are materialized into
// `.runtime/target-workspace/`; the service records which target is actually
// selected so the UI can present real provenance.
const targetWorkspace = new TargetWorkspaceService(runtimePaths);

// --- Task Management infrastructure ---
const taskEventStore = new AppendOnlyProcessingEventStore(
  runtimePaths.taskEvents,
);
const events = new ProcessingEventBus(taskEventStore);
const runs = new RunRepository(runtimePaths.runState);
const task = new TaskManagement(
  taskEventStore,
  new CheckpointStore(runtimePaths.checkpoints),
);

// --- Intent Collection infrastructure ---
const intent = new IntentCollectionService(
  new ConversationStore(runtimePaths.conversations),
);

// --- Global event observer: wires events into run snapshots + task checkpoints ---
events.observe((e) => {
  const snapshot = runs.get(e.run_id);
  if (!snapshot) return;
  runs.event(e.run_id, e);
  task.onEvent(e, runs.require(e.run_id));
});

// --- Validation & Contracts (composed through the Reusable Skill subsystem) ---
// Canonical contract operations keep their own bridge. Triple Validation has
// three separate Python lanes; the native WorkflowRuntime starts all three
// in parallel via Promise.all.
const bridge = new PythonBridge();
const validationLanes = new ValidationLanePool();
const skills = createSkillSystem();
const runtimeCtx = {
  caller_id: "backend/runtime",
  bridge,
  events,
  services: { task, runs, intent } as Record<string, unknown>,
};
const contractsSkill = await skills.activation.activate(
  { skill_id: "oneshot-canonical-contracts" },
  runtimeCtx,
);
const contracts = contractsSkill.underlying as CanonicalContractSkill;
if (!(contracts instanceof CanonicalContractSkill)) {
  throw new Error("canonical contracts skill did not bind its runtime instance");
}
await contracts.verifyStatic();

// --- Runtime Info (mode for health endpoint / UI) ---
const runtimeMode = (process.env.ONESHOT_MODE || "standalone").trim() || "standalone";

// --- Deterministic Triple Validation ---
const deterministic = new DeterministicValidationRuntime(validationLanes);
const triple = new TripleValidationWorkflow(deterministic, contracts);

// --- Sandbox Infrastructure (runner selectable via ONESHOT_SANDBOX_RUNNER) ---
const sandbox = new SandboxService(
  contracts,
  events,
  process.env.ONESHOT_SANDBOX_RUNNER === "container"
    ? new ContainerSandboxRunner()
    : new HardenedProcessRunner(),
  runtimePaths.sandboxWorkspaces,
);

// --- Agent workflow instances used by the per-stage pipeline ---
const artifactStore = new FileArtifactStore(runtimePaths.runs);
const planner = new PlannerWorkflow(contracts);
const refactor = new RefactorWorkflow(contracts);
const gapper = new GapAnalysisWorkflow(contracts);
const evaluator = new EvaluationWorkflow(contracts);
const confirmation = new ConfirmationWorkflow(contracts);
const hash = new HashWorkflow(contracts);
const builder = new BuilderWorkflow(sandbox);

const pythonReasoner = createPythonReasoner();

const stageServices: StageServices = {
  events,
  contracts,
  planner,
  refactor,
  gapper,
  evaluator,
  triple,
  confirmation,
  hash,
  builder,
  saveArtifact,
  pythonReasoner,
};

// --- Native OneShot Workflow Runtime ---
const bindDependencies = async () => ({
  researcher: new ResearcherWorkflow(contracts, undefined, projectRoot),
  planner,
  refactor,
  gapper,
  evaluator,
  triple,
  confirmation,
  hash,
  builder,
});
const runtime = new WorkflowRuntime(
  events,
  runs,
  artifactStore,
  bindDependencies,
);

// --- Bind the remaining production Skills to live runtime services ---
runtimeCtx.services.sandbox = sandbox;
runtimeCtx.services.contracts = contracts;
await skills.activation.activate({ skill_id: "oneshot-task-runtime" }, runtimeCtx);
await skills.activation.activate({ skill_id: "oneshot-intent-collection" }, runtimeCtx);
await skills.activation.activate({ skill_id: "oneshot-sandbox-runtime" }, runtimeCtx);
await skills.activation.activate({ skill_id: "oneshot-init" }, runtimeCtx);

// --- Per-stage BullMQ pipeline (primary scheduling/execution lifecycle) ---
// Jobs carry only { runId }; durable state lives in RunRepository + ArtifactStore.
let pipelineReady = false;
try {
  await Promise.race([
    pipelineQueue.waitUntilReady(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("pipeline Redis connection timeout")),
        Number(process.env.ONESHOT_QUEUE_READY_TIMEOUT || 8_000),
      ),
    ),
  ]);
  pipelineReady = true;
} catch (err) {
  const reason = err instanceof Error ? err.message : String(err);
  console.warn(
    `ONESHOT_PIPELINE_REDIS_UNAVAILABLE (${reason}) — per-stage pipeline disabled; falling back to legacy runtime`,
  );
}

let pipelineWorker: ReturnType<typeof createPipelineWorker> | undefined;
let pipelineQueueEvents: QueueEvents | undefined;
const pipelineHistory = new PipelineHistory(getSharedRedis());

/*
 * Durable transition services (shared by the inline worker when enabled and
 * by the diagnostic reconcile endpoint).
 */
const transitionHandle = pipelineReady
  ? createTransitionServices({
      runs,
      store: artifactStore,
      events,
      redis: getSharedRedis(),
      history: pipelineHistory,
    })
  : undefined;

if (pipelineReady) {
  pipelineQueueEvents = createPipelineQueueEvents({ events });

  /*
   * Production runs the BullMQ worker in a separate process so a stage crash
   * cannot take down the HTTP API. Set ONESHOT_START_WORKER=true to run the
   * worker inline (useful for local development without a second terminal).
   */
  if (process.env.ONESHOT_START_WORKER === "true") {
    pipelineWorker = createPipelineWorker({
      runs,
      store: artifactStore,
      services: stageServices,
      redis: getSharedRedis(),
      history: pipelineHistory,
      concurrency: Number(process.env.ONESHOT_RUN_CONCURRENCY || 1),
    });
    console.log(
      "[OneShot] Pipeline worker started inline (ONESHOT_START_WORKER=true)",
    );
  }
}

// --- Legacy single-queue BullMQ runtime (fallback when pipeline Redis down) ---
const queueDeps: RunQueueDeps = {
  runs,
  events,
  projectRoot,
  createRuntime: async () =>
    new WorkflowRuntime(
      events,
      runs,
      artifactStore,
      bindDependencies,
    ),
};
const runQueue = new BullMQRunQueue(RUN_QUEUE_NAME, queueDeps, {
  concurrency: Number(process.env.ONESHOT_RUN_CONCURRENCY || 1),
});
let queueReady = true;
try {
  await runQueue.ready(Number(process.env.ONESHOT_QUEUE_READY_TIMEOUT || 8_000));
} catch (err) {
  queueReady = false;
  const reason = err instanceof Error ? err.message : String(err);
  console.warn(
    `ONESHOT_LEGACY_QUEUE_REDIS_UNAVAILABLE (${reason}) — legacy inline fallback active`,
  );
}

// --- Runtime Info (mode for health endpoint / UI) ---
const runtimeInfo: RuntimeInfo = {
  mode: runtimeMode,
  queue: queueReady || pipelineReady,
};

// --- HTTP Server ---
const webDistPath = resolve(projectRoot, "app/web/dist");
const uiRoot = existsSync(webDistPath) ? webDistPath : resolve(projectRoot, "ui");
const workspaceRoot = resolve(
  process.env.ONESHOT_WORKSPACE_ROOT || projectRoot,
);

const server = await startHttpServer(
  runtime,
  runs,
  events,
  uiRoot,
  Number(process.env.PORT || 8787),
  task,
  intent,
  sandbox,
  runtimeInfo,
  {
    workspaceRoot,
    executeInline: (job) =>
      executeRunJob({ data: job, updateProgress: async () => {} }, queueDeps),
    targetWorkspace,
    pipeline: pipelineReady
      ? {
          queueReady: true,
          enqueue: (runId: string, stage) =>
            enqueueStage(runId, stage, pipelineHistory),
          confirmPlan: async (
            runId: string,
            edits?: import("./pipeline/types.js").PlanReviewEdits,
          ) => {
            return confirmPlan({
              runId,
              redis: getSharedRedis(),
              history: pipelineHistory,
              store: artifactStore,
              runs,
              edits,
            });
          },
          history: pipelineHistory,
          store: artifactStore,
          getQueueCounts: async () => {
            const c = await pipelineQueue.getJobCounts();
            return {
              waiting: c.waiting,
              active: c.active,
              failed: c.failed,
            };
          },
          reconcile: transitionHandle
            ? (runId, stage, iteration) =>
                reconcileStage(
                  { runId, stage, iteration },
                  transitionHandle.checkpoints,
                  transitionHandle.services,
                )
            : undefined,
        }
      : undefined,
  },
  runQueue,
  queueReady,
);

const address = server.address();
const port =
  typeof address === "object" && address ? address.port : process.env.PORT;
console.log(
  `ONESHOT_SERVER_READY port=${port} mode=${runtimeInfo.mode}`,
);

// --- Graceful shutdown ---
const shutdown = async () => {
  server.close(async () => {
    try { await pipelineQueue.close(); } catch { /* ignore */ }
    try { await pipelineWorker?.close(); } catch { /* ignore */ }
    if (pipelineQueueEvents) {
      try { await closePipelineQueueEvents(pipelineQueueEvents); } catch { /* ignore */ }
    }
    try { await runQueue.close(); } catch { /* ignore */ }

    validationLanes.close();
    bridge.close();
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
