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
import { ProviderManager } from "./runtime/provider-manager.js";
import type { ResearchProvider } from "./role/researcher/provider.js";
import { createDynamicDependencyFactory } from "./workflow/adk/dynamic-dependencies.js";
import {
  BullMQRunQueue,
  RUN_QUEUE_NAME,
  type RunQueueDeps,
} from "./runtime/queue.js";
import { ResearcherWorkflow } from "./role/researcher/workflow.js";
import { PlannerWorkflow } from "./role/planner/workflow.js";
import { RefactorWorkflow } from "./role/refactor/workflow.js";
import { GapAnalysisWorkflow } from "./role/gap-analysis/workflow.js";
import { EvaluationWorkflow } from "./role/evaluation/workflow.js";
import { BuilderWorkflow } from "./role/builder/workflow.js";
import { TripleValidationWorkflow } from "./workflow/triple-validation.js";
import { WorkflowRuntime } from "./runtime/workflow-runtime.js";
import { SandboxService } from "./sandbox/sandbox-service.js";
import { HardenedProcessRunner } from "./sandbox/runner/process-runner.js";
import { ContainerSandboxRunner } from "./sandbox/runner/container-runner.js";
import { startHttpServer, type RuntimeInfo } from "./server/http-server.js";
import { getRuntimePaths, ensureRuntimeDirectories } from "./runtime/runtime-config.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const projectRoot = process.env.ONESHOT_ROOT || process.cwd();

// --- Runtime Directory Initialization ---
const runtimePaths = getRuntimePaths(projectRoot);
ensureRuntimeDirectories(runtimePaths);

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
// three separate Python lanes; the ADK dynamic node starts all three runNode()
// calls before awaiting Promise.all.
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

// --- Research Provider (web-managed selection via ProviderManager) ---
const providerManager = new ProviderManager({
  projectRoot,
  events,
  catalogPath: resolve(projectRoot, "backend/config/providers.json"),
  runtimePaths: runtimePaths,
});
const provider = await providerManager.createProvider(projectRoot, events);

// --- Runtime Info (mode + provider name for health endpoint / UI) ---
const runtimeMode = (process.env.ONESHOT_MODE || "sample").toLowerCase();
const providerName = provider.constructor?.name || "UnknownProvider";

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

// --- Google ADK Dynamic Workflow Runtime ---
// The dependency factory proves provider/model readiness per job and returns
// the existing OneShot Role implementations consumed by ADK connector nodes.
const bindDependencies = createDynamicDependencyFactory({
  projectRoot,
  events,
  contracts,
  sandbox,
  triple,
  provider,
});
const runtime = new WorkflowRuntime(
  events,
  runs,
  new FileArtifactStore(runtimePaths.runs),
  bindDependencies,
);

// --- Bind the remaining production Skills to live runtime services ---
runtimeCtx.services.sandbox = sandbox;
runtimeCtx.services.contracts = contracts;
await skills.activation.activate({ skill_id: "oneshot-task-runtime" }, runtimeCtx);
await skills.activation.activate({ skill_id: "oneshot-intent-collection" }, runtimeCtx);
await skills.activation.activate({ skill_id: "oneshot-sandbox-runtime" }, runtimeCtx);
await skills.activation.activate({ skill_id: "oneshot-init" }, runtimeCtx);

// --- BullMQ Run Queue + Worker (scheduling/execution lifecycle) ---
// Provider binding is per-run inside the worker, immediately before the
// canonical workflow executes. RunRepository remains the durable source of
// truth; Redis/BullMQ only transports scheduling + live progress.
const queueDeps: RunQueueDeps = {
  runs,
  events,
  projectRoot,
  resolveProvider: async (providerId: string, _ev: ProcessingEventBus, runId: string) => {
    // Provider binding happens per run inside the worker, immediately before the
    // canonical workflow consumes the provider. Use ProviderManager's
    // resolveForRun to create the ResearchProvider from catalog entry.
    return providerManager.resolveForRun(providerId);
  },
  createRuntime: async () =>
    new WorkflowRuntime(
      events,
      runs,
      new FileArtifactStore(runtimePaths.runs),
      bindDependencies,
    ),
};
const runQueue = new BullMQRunQueue(RUN_QUEUE_NAME, queueDeps, {
  concurrency: Number(process.env.ONESHOT_RUN_CONCURRENCY || 1),
});
// Wait for Redis/Worker readiness before serving; degrade gracefully so local
// development without Redis still works (inline fallback in the HTTP layer).
let queueReady = true;
try {
  await runQueue.ready(Number(process.env.ONESHOT_QUEUE_READY_TIMEOUT || 8_000));
} catch (err) {
  queueReady = false;
  const reason = err instanceof Error ? err.message : String(err);
  console.warn(
    `ONESHOT_QUEUE_REDIS_UNAVAILABLE (${reason}) — runs will execute inline in-process`,
  );
}

// --- Runtime Info (mode + provider name for health endpoint / UI) ---
const runtimeInfo: RuntimeInfo = {
  mode: runtimeMode,
  provider: providerName,
  queue: queueReady,
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
  { workspaceRoot },
  runQueue,
  providerManager,
  queueReady,
);

const address = server.address();
const port =
  typeof address === "object" && address ? address.port : process.env.PORT;
console.log(
  `ONESHOT_SERVER_READY port=${port} mode=${runtimeInfo.mode} provider=${runtimeInfo.provider}`,
);

// --- Graceful shutdown ---
const shutdown = async () => {
  server.close(async () => {
    try { await runQueue.close(); } catch { /* ignore */ }
    provider.close?.();
    providerManager.close();
    validationLanes.close();
    bridge.close();
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
