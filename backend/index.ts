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
import { DeterministicValidationRuntime } from "./validation/deterministic-validation.js";
import { CanonicalContractSkill } from "./skill/canonical-contract-skill.js";
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
import { startHttpServer } from "./server/http-server.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const projectRoot = process.env.ONESHOT_ROOT || process.cwd();

// --- Task Management infrastructure ---
const taskEventStore = new AppendOnlyProcessingEventStore(
  resolve(projectRoot, "data/task-events"),
);
const events = new ProcessingEventBus(taskEventStore);
const runs = new RunRepository(resolve(projectRoot, "data/run-state"));
const task = new TaskManagement(
  taskEventStore,
  new CheckpointStore(resolve(projectRoot, "data/checkpoints")),
);

// --- Intent Collection infrastructure ---
const intent = new IntentCollectionService(
  new ConversationStore(resolve(projectRoot, "data/conversations")),
);

// --- Global event observer: wires events into run snapshots + task checkpoints ---
events.observe((e) => {
  const snapshot = runs.get(e.run_id);
  if (!snapshot) return;
  runs.event(e.run_id, e);
  task.onEvent(e, runs.require(e.run_id));
});

// --- Validation & Contracts ---
const bridge = new PythonBridge();
const contracts = new CanonicalContractSkill(bridge);
await contracts.verifyStatic();

// --- Research Provider (with event bus for ADK-scoped events) ---
const provider = await resolveResearchProvider(projectRoot, events);

// --- Deterministic Validation ---
const deterministic = new DeterministicValidationRuntime(bridge);

// --- Workflow Runtime ---
const runtime = new WorkflowRuntime(
  events,
  runs,
  new FileArtifactStore(resolve(projectRoot, "data/runs")),
  new ResearcherWorkflow(provider, contracts),
  new PlannerWorkflow(contracts),
  new RefactorWorkflow(contracts),
  new GapAnalysisWorkflow(contracts),
  new EvaluationWorkflow(contracts),
  new TripleValidationWorkflow(deterministic, contracts),
  new ConfirmationWorkflow(contracts),
  new HashWorkflow(contracts),
);

// --- Sandbox Infrastructure ---
const sandbox = new SandboxService(
  contracts,
  events,
  new HardenedProcessRunner(),
  resolve(projectRoot, "data/sandbox-workspaces"),
);

// --- HTTP Server ---
const server = await startHttpServer(
  runtime,
  runs,
  events,
  resolve(projectRoot, "ui"),
  Number(process.env.PORT || 8787),
  task,
  intent,
  sandbox,
);

const address = server.address();
const port =
  typeof address === "object" && address ? address.port : process.env.PORT;
console.log(`ONESHOT_SERVER_READY port=${port}`);

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
