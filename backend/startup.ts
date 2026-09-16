import "./environment.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Server } from "node:http";
import type { Queue, QueueEvents } from "bullmq";
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
  confirmPlan,
  createPipelineQueueEvents,
  createPipelineQueue,
  createPipelineWorker,
  enqueueStage,
  saveArtifact,
  type StageServices,
  PipelineHistory,
  createTransitionServices,
  reconcileStage,
  closePipelineQueueEvents,
} from "./pipeline/index.js";
import { getSharedRedis, probeRedis } from "./runtime/redis-connection.js";
import { WorkflowRuntime } from "./runtime/workflow-runtime.js";
import { SandboxService } from "./sandbox/sandbox-service.js";
import { HardenedProcessRunner } from "./sandbox/runner/process-runner.js";
import { ContainerSandboxRunner } from "./sandbox/runner/container-runner.js";
import { TargetWorkspaceService } from "./runtime/target-workspace.js";
import {
  startHttpServer,
  type RuntimeInfo,
  type PipelineApi,
} from "./server/http-server.js";
import {
  getRuntimePaths,
  ensureRuntimeDirectories,
  type RuntimePaths,
} from "./runtime/runtime-config.js";
import { createPythonReasoner } from "./reasoning/python-client.js";

// ---------------------------------------------------------------------------
// Execution mode vocabulary
// ---------------------------------------------------------------------------

export type ExecutionMode =
  | "redis-pipeline"
  | "redis-legacy"
  | "standalone"
  | "unavailable";

// ---------------------------------------------------------------------------
// Common durable services (independent of Redis)
// ---------------------------------------------------------------------------

interface CommonServices {
  projectRoot: string;
  runtimePaths: RuntimePaths;
  targetWorkspace: TargetWorkspaceService;
  taskEventStore: AppendOnlyProcessingEventStore;
  events: ProcessingEventBus;
  runs: RunRepository;
  task: TaskManagement;
  intent: IntentCollectionService;
  bridge: PythonBridge;
  validationLanes: ValidationLanePool;
  contracts: CanonicalContractSkill;
  skills: ReturnType<typeof createSkillSystem>;
  deterministic: DeterministicValidationRuntime;
  triple: TripleValidationWorkflow;
  sandbox: SandboxService;
  artifactStore: FileArtifactStore;
  planner: PlannerWorkflow;
  refactor: RefactorWorkflow;
  gapper: GapAnalysisWorkflow;
  evaluator: EvaluationWorkflow;
  confirmation: ConfirmationWorkflow;
  hash: HashWorkflow;
  builder: BuilderWorkflow;
  pythonReasoner: ReturnType<typeof createPythonReasoner>;
  stageServices: StageServices;
  researcher: ResearcherWorkflow;
  runtime: WorkflowRuntime;
  queueDeps: RunQueueDeps;
  runtimeMode: string;
  bindDependencies: () => Promise<{
    researcher: ResearcherWorkflow;
    planner: PlannerWorkflow;
    refactor: RefactorWorkflow;
    gapper: GapAnalysisWorkflow;
    evaluator: EvaluationWorkflow;
    triple: TripleValidationWorkflow;
    confirmation: ConfirmationWorkflow;
    hash: HashWorkflow;
    builder: BuilderWorkflow;
  }>;
}
async function buildCommonServices(
  projectRoot: string,
): Promise<CommonServices> {
  const runtimePaths = getRuntimePaths(projectRoot);
  ensureRuntimeDirectories(runtimePaths);

  const targetWorkspace = new TargetWorkspaceService(runtimePaths);

  const taskEventStore = new AppendOnlyProcessingEventStore(
    runtimePaths.taskEvents,
  );
  const events = new ProcessingEventBus(taskEventStore);
  const runs = new RunRepository(runtimePaths.runState);
  const task = new TaskManagement(
    taskEventStore,
    new CheckpointStore(runtimePaths.checkpoints),
  );

  const intent = new IntentCollectionService(
    new ConversationStore(runtimePaths.conversations),
  );

  events.observe((e) => {
    const snapshot = runs.get(e.run_id);
    if (!snapshot) return;
    runs.event(e.run_id, e);
    task.onEvent(e, runs.require(e.run_id));
  });

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

  const runtimeMode =
    (process.env.ONESHOT_MODE || "standalone").trim() || "standalone";

  const deterministic = new DeterministicValidationRuntime(validationLanes);
  const triple = new TripleValidationWorkflow(deterministic, contracts);

  const sandbox = new SandboxService(
    contracts,
    events,
    process.env.ONESHOT_SANDBOX_RUNNER === "container"
      ? new ContainerSandboxRunner()
      : new HardenedProcessRunner(),
    runtimePaths.sandboxWorkspaces,
  );

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

  const researcher = new ResearcherWorkflow(contracts, undefined, projectRoot);
  const bindDependencies = async () => ({
    researcher,
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

  runtimeCtx.services.sandbox = sandbox;
  runtimeCtx.services.contracts = contracts;
  await skills.activation.activate(
    { skill_id: "oneshot-task-runtime" },
    runtimeCtx,
  );
  await skills.activation.activate(
    { skill_id: "oneshot-intent-collection" },
    runtimeCtx,
  );
  await skills.activation.activate(
    { skill_id: "oneshot-sandbox-runtime" },
    runtimeCtx,
  );
  await skills.activation.activate({ skill_id: "oneshot-init" }, runtimeCtx);

  const queueDeps: RunQueueDeps = {
    runs,
    events,
    projectRoot,
    createRuntime: async () =>
      new WorkflowRuntime(events, runs, artifactStore, bindDependencies),
  };

  return {
    projectRoot,
    runtimePaths,
    targetWorkspace,
    taskEventStore,
    events,
    runs,
    task,
    intent,
    bridge,
    validationLanes,
    contracts,
    skills,
    deterministic,
    triple,
    sandbox,
    artifactStore,
    planner,
    refactor,
    gapper,
    evaluator,
    confirmation,
    hash,
    builder,
    pythonReasoner,
    stageServices,
    researcher,
    runtime,
    queueDeps,
    runtimeMode,
    bindDependencies,
  };
}

// ---------------------------------------------------------------------------
// Redis-backed runtime modes
// ---------------------------------------------------------------------------

interface PipelineResources {
  mode: "redis-pipeline";
  queue: Queue<import("./pipeline/types.js").StageJobData, unknown, import("./pipeline/types.js").PipelineStage>;
  history: PipelineHistory;
  transitionHandle: import("./pipeline/transition-services.js").TransitionServicesHandle;
  queueEvents: QueueEvents;
  worker?: ReturnType<typeof createPipelineWorker>;
  close(): Promise<void>;
}

async function startRedisPipeline(
  common: CommonServices,
): Promise<PipelineResources> {
  const pipelineReadyTimeout = Number(
    process.env.ONESHOT_QUEUE_READY_TIMEOUT || 8_000,
  );

  // Bounded, short-lived reachability probe: fail fast without creating a
  // persistent BullMQ client that would retry forever. The bound is
  // configurable via ONESHOT_REDIS_PROBE_TIMEOUT_MS because cloud Redis
  // endpoints over TLS may need more than 2 s to handshake.
  const probeTimeout = Math.min(
    pipelineReadyTimeout,
    Number(process.env.ONESHOT_REDIS_PROBE_TIMEOUT_MS) || 2_000,
  );
  await probeRedis(probeTimeout);

  const queue = createPipelineQueue();

  let worker: ReturnType<typeof createPipelineWorker> | undefined;
  let queueEvents: QueueEvents | undefined;
  let transitionHandle:
    | import("./pipeline/transition-services.js").TransitionServicesHandle
    | undefined;
  let pipelineHistory: PipelineHistory | undefined;

  const close = async () => {
    if (worker) {
      try {
        await worker.close();
      } catch {
        /* ignore */
      }
      worker = undefined;
    }
    if (queueEvents) {
      try {
        await closePipelineQueueEvents(queueEvents);
      } catch {
        /* ignore */
      }
      queueEvents = undefined;
    }
    transitionHandle = undefined;
    pipelineHistory = undefined;
    try {
      await queue.close();
    } catch {
      /* ignore */
    }
  };

  try {
    await Promise.race([
      queue.waitUntilReady(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("pipeline Redis connection timeout")),
          pipelineReadyTimeout,
        ),
      ),
    ]);

    const redis = getSharedRedis();
    pipelineHistory = new PipelineHistory(redis);

    transitionHandle = createTransitionServices({
      runs: common.runs,
      store: common.artifactStore,
      events: common.events,
      redis,
      history: pipelineHistory,
      queue,
    });

    queueEvents = createPipelineQueueEvents({ events: common.events });

    if (process.env.ONESHOT_START_WORKER === "true") {
      worker = createPipelineWorker({
        runs: common.runs,
        store: common.artifactStore,
        services: common.stageServices,
        redis,
        history: pipelineHistory,
        concurrency: Number(process.env.ONESHOT_RUN_CONCURRENCY || 1),
      });
      console.log(
        "[OneShot] Pipeline worker started inline (ONESHOT_START_WORKER=true)",
      );
    }
  } catch (err) {
    await close();
    throw err;
  }

  return {
    mode: "redis-pipeline",
    queue,
    history: pipelineHistory!,
    transitionHandle: transitionHandle!,
    queueEvents: queueEvents!,
    worker,
    close,
  };
}

interface LegacyResources {
  mode: "redis-legacy";
  runQueue: BullMQRunQueue;
  queueReady: boolean;
  close(): Promise<void>;
}

async function startLegacyRedisQueue(
  common: CommonServices,
): Promise<LegacyResources> {
  const queueReadyTimeout = Number(
    process.env.ONESHOT_QUEUE_READY_TIMEOUT || 8_000,
  );

  // Bounded probe before opening the legacy run-queue. If Redis is not
  // reachable, fail fast without leaving a retrying Worker/QueueEvents behind.
  const probeTimeout = Math.min(
    queueReadyTimeout,
    Number(process.env.ONESHOT_REDIS_PROBE_TIMEOUT_MS) || 2_000,
  );
  await probeRedis(probeTimeout);

  const runQueue = new BullMQRunQueue(RUN_QUEUE_NAME, common.queueDeps, {
    concurrency: Number(process.env.ONESHOT_RUN_CONCURRENCY || 1),
  });

  try {
    await runQueue.ready(queueReadyTimeout);
  } catch (err) {
    await runQueue.close();
    throw err;
  }

  return {
    mode: "redis-legacy",
    runQueue,
    queueReady: true,
    close: () => runQueue.close(),
  };
}

// ---------------------------------------------------------------------------
// Pipeline API assembly
// ---------------------------------------------------------------------------

function buildPipelineApi(
  resources: PipelineResources,
  common: CommonServices,
): PipelineApi {
  return {
    queueReady: true,
    enqueue: (runId: string, stage, iteration?) =>
      enqueueStage(resources.queue, runId, stage, resources.history, iteration),
    confirmPlan: async (
      runId: string,
      edits?: import("./pipeline/types.js").PlanReviewEdits,
    ) => {
      return confirmPlan({
        runId,
        redis: getSharedRedis(),
        queue: resources.queue,
        history: resources.history,
        store: common.artifactStore,
        runs: common.runs,
        edits,
      });
    },
    history: resources.history,
    store: common.artifactStore,
    getQueueCounts: async () => {
      const c = await resources.queue.getJobCounts();
      return {
        waiting: c.waiting,
        active: c.active,
        failed: c.failed,
      };
    },
    reconcile: (runId, stage, iteration) =>
      reconcileStage(
        { runId, stage, iteration },
        resources.transitionHandle.checkpoints,
        resources.transitionHandle.services,
      ),
  };
}

// ---------------------------------------------------------------------------
// Public startup entry point
// ---------------------------------------------------------------------------

export interface StartupResult {
  server: Server;
  runtimeInfo: RuntimeInfo;
  close(): Promise<void>;
}

export async function startOneShot(
  options: { projectRoot?: string; port?: number } = {},
): Promise<StartupResult> {
  const projectRoot =
    options.projectRoot || process.env.ONESHOT_ROOT || process.cwd();
  const common = await buildCommonServices(projectRoot);

  const requireRedis = process.env.ONESHOT_REQUIRE_REDIS === "true";
  let mode: ExecutionMode | undefined;
  let pipelineResources: PipelineResources | undefined;
  let legacyResources: LegacyResources | undefined;

  const tryPipeline = async () => {
    pipelineResources = await startRedisPipeline(common);
    mode = "redis-pipeline";
  };

  const tryLegacy = async () => {
    legacyResources = await startLegacyRedisQueue(common);
    mode = "redis-legacy";
  };

  if (!requireRedis) {
    try {
      await tryPipeline();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `ONESHOT_PIPELINE_REDIS_UNAVAILABLE (${reason}) — per-stage pipeline disabled; falling back to legacy runtime`,
      );
      try {
        await tryLegacy();
      } catch (legacyErr) {
        const legacyReason =
          legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
        console.warn(
          `ONESHOT_LEGACY_QUEUE_REDIS_UNAVAILABLE (${legacyReason}) — legacy inline fallback active`,
        );
        mode = "standalone";
      }
    }
  } else {
    try {
      await tryPipeline();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `ONESHOT_PIPELINE_REDIS_UNAVAILABLE (${reason}) — Redis required; pipeline unavailable`,
      );
      try {
        await tryLegacy();
      } catch (legacyErr) {
        const legacyReason =
          legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
        console.warn(
          `ONESHOT_LEGACY_QUEUE_REDIS_UNAVAILABLE (${legacyReason}) — Redis required; legacy unavailable`,
        );
        mode = "unavailable";
      }
    }
  }

  const pipelineApi =
    mode === "redis-pipeline" && pipelineResources
      ? buildPipelineApi(pipelineResources, common)
      : undefined;
  const runQueue =
    mode === "redis-legacy" && legacyResources ? legacyResources.runQueue : undefined;
  const queueReady =
    mode === "redis-legacy" && legacyResources ? legacyResources.queueReady : false;

  const runtimeInfo: RuntimeInfo = {
    mode,
    deploymentMode: common.runtimeMode,
    queue: mode === "redis-pipeline" || mode === "redis-legacy",
  };

  const webDistPath = resolve(projectRoot, "frontend/web/dist");
  const legacyWebDistPath = resolve(projectRoot, "app/web/dist");
  const uiRoot = existsSync(webDistPath)
    ? webDistPath
    : existsSync(legacyWebDistPath)
      ? legacyWebDistPath
      : resolve(projectRoot, "ui");
  const workspaceRoot = resolve(
    process.env.ONESHOT_WORKSPACE_ROOT || projectRoot,
  );

  const server = await startHttpServer(
    common.runtime,
    common.runs,
    common.events,
    uiRoot,
    options.port ?? Number(process.env.PORT || 8787),
    common.task,
    common.intent,
    common.sandbox,
    runtimeInfo,
    {
      workspaceRoot,
      executeInline: (job) =>
        executeRunJob(
          { data: job, updateProgress: async () => {} },
          common.queueDeps,
        ),
      targetWorkspace: common.targetWorkspace,
      researcher: common.researcher,
      pipeline: pipelineApi,
    },
    runQueue,
    queueReady,
  );

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;

    try {
      server.closeAllConnections?.();
    } catch {
      /* ignore */
    }
    await new Promise<void>((ok, fail) => {
      server.close((err) => (err ? fail(err) : ok()));
    }).catch(() => {});

    if (pipelineResources) {
      await pipelineResources.close().catch(() => {});
    }
    if (legacyResources) {
      await legacyResources.close().catch(() => {});
    }

    common.validationLanes.close();
    common.bridge.close();
  };

  return { server, runtimeInfo, close };
}

