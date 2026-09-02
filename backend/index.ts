import "./environment.js";
import { existsSync } from "node:fs";
import { resolveRuntimePaths } from "./runtime-paths.js";
import { ProcessingEventBus } from "./runtime/event-bus.js";
import { RunRepository } from "./runtime/run-repository.js";
import { FileArtifactStore } from "./runtime/artifact-store.js";
import { AppendOnlyProcessingEventStore } from "./task/event/event-store.js";
import { CheckpointStore } from "./task/checkpoint/checkpoint-store.js";
import { TaskManagement } from "./task/task-management.js";
import { ConversationStore } from "./intent/conversation-store.js";
import { IntentCollectionService } from "./intent/intent-collection.js";
import { PythonBridge } from "./validation/python-bridge.js";
import { DeterministicValidationRuntime } from "./validation/deterministic-validation.js";
import { CanonicalContractSkill } from "./skill/canonical-contract-skill.js";
import { createSkillSystem } from "./skill/bootstrap.js";
import { SkillCatalog } from "./skill/catalog.js";
import { resolveResearchProvider } from "./role/researcher/provider-resolver.js";
import { ResearcherWorkflow } from "./role/researcher/workflow.js";
import { PlannerWorkflow } from "./role/planner/workflow.js";
import { RefactorWorkflow } from "./role/refactor/workflow.js";
import { GapAnalysisWorkflow } from "./role/gap-analysis/workflow.js";
import { EvaluationWorkflow } from "./role/evaluation/workflow.js";
import { TripleValidationWorkflow } from "./workflow/triple-validation.js";
import { ConfirmationWorkflow } from "./workflow/confirmation.js";
import { HashWorkflow } from "./workflow/hash.js";
import { WorkflowRuntime } from "./runtime/workflow-runtime.js";
import { SandboxService } from "./sandbox/sandbox-service.js";
import { HardenedProcessRunner } from "./sandbox/runner/process-runner.js";
import { ContainerSandboxRunner } from "./sandbox/runner/container-runner.js";
import { startHttpServer, type RuntimeInfo } from "./server/http-server.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const runtimePaths = resolveRuntimePaths();
const projectRoot = runtimePaths.projectRoot;

// --- Task Management infrastructure ---
const taskEventStore = new AppendOnlyProcessingEventStore(
  runtimePaths.taskEventsRoot,
);
const events = new ProcessingEventBus(taskEventStore);
const runs = new RunRepository(runtimePaths.runStateRoot);
const task = new TaskManagement(
  taskEventStore,
  new CheckpointStore(runtimePaths.checkpointsRoot),
);

// --- Intent Collection infrastructure ---
const intent = new IntentCollectionService(
  new ConversationStore(runtimePaths.conversationsRoot),
);

// --- Global event observer: wires events into run snapshots + task checkpoints ---
events.observe((e) => {
  const snapshot = runs.get(e.run_id);
  if (!snapshot) return;
  runs.event(e.run_id, e);
  task.onEvent(e, runs.require(e.run_id));
});

// --- Validation & Contracts (composed through the Reusable Skill subsystem) ---
const bridge = new PythonBridge(undefined, runtimePaths);
const skills = createSkillSystem(
  new SkillCatalog(undefined, runtimePaths),
  runtimePaths,
);
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

// --- Research Provider (with event bus for ADK-scoped events) ---
const provider = await resolveResearchProvider(projectRoot, events);

// --- Runtime Info (mode + provider name for health endpoint / UI) ---
const runtimeMode = (process.env.ONESHOT_MODE || "sample").toLowerCase();
const providerName = provider.constructor?.name || "UnknownProvider";
const runtimeInfo: RuntimeInfo = { mode: runtimeMode, provider: providerName };

// --- Deterministic Validation ---
const deterministic = new DeterministicValidationRuntime(bridge);

// --- Workflow Runtime ---
const runtime = new WorkflowRuntime(
  events,
  runs,
  new FileArtifactStore(runtimePaths.artifactRunsRoot),
  new ResearcherWorkflow(provider, contracts),
  new PlannerWorkflow(contracts),
  new RefactorWorkflow(contracts),
  new GapAnalysisWorkflow(contracts),
  new EvaluationWorkflow(contracts),
  new TripleValidationWorkflow(deterministic, contracts),
  new ConfirmationWorkflow(contracts),
  new HashWorkflow(contracts),
);

// --- Sandbox Infrastructure (runner selectable via ONESHOT_SANDBOX_RUNNER) ---
const sandbox = new SandboxService(
  contracts,
  events,
  process.env.ONESHOT_SANDBOX_RUNNER === "container"
    ? new ContainerSandboxRunner()
    : new HardenedProcessRunner(),
  runtimePaths.sandboxWorkspacesRoot,
);

// --- Bind the remaining production Skills to live runtime services ---
runtimeCtx.services.sandbox = sandbox;
runtimeCtx.services.contracts = contracts;
await skills.activation.activate({ skill_id: "oneshot-task-runtime" }, runtimeCtx);
await skills.activation.activate({ skill_id: "oneshot-intent-collection" }, runtimeCtx);
await skills.activation.activate({ skill_id: "oneshot-sandbox-runtime" }, runtimeCtx);
await skills.activation.activate({ skill_id: "oneshot-init" }, runtimeCtx);

// --- HTTP Server ---
const uiRoot = existsSync(runtimePaths.webDistRoot)
  ? runtimePaths.webDistRoot
  : runtimePaths.legacyUiRoot;

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
  { workspaceRoot: runtimePaths.workspaceRoot },
);

const address = server.address();
const port =
  typeof address === "object" && address ? address.port : process.env.PORT;
console.log(`ONESHOT_SERVER_READY port=${port} mode=${runtimeInfo.mode} provider=${runtimeInfo.provider}`);
console.log(
  `ONESHOT_PATHS_RESOLVED project_root=${JSON.stringify(runtimePaths.projectRoot)} workspace_root=${JSON.stringify(runtimePaths.workspaceRoot)} project_source=${runtimePaths.trace.projectRootSource} workspace_source=${runtimePaths.trace.workspaceRootSource}`,
);

// --- Graceful shutdown ---
const shutdown = () => {
  server.close(() => {
    provider.close?.();
    bridge.close();
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
