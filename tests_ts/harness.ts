import { rmSync } from "node:fs";
import { resolve } from "node:path";
import type { Prompt } from "../backend/contract/types.js";
import type { ResearchProvider } from "../backend/role/researcher/provider.js";
import { ProcessingEventBus } from "../backend/runtime/event-bus.js";
import { AppendOnlyProcessingEventStore } from "../backend/task/event/event-store.js";
import { CheckpointStore } from "../backend/task/checkpoint/checkpoint-store.js";
import { TaskManagement } from "../backend/task/task-management.js";
import { RunRepository } from "../backend/runtime/run-repository.js";
import { FileArtifactStore } from "../backend/runtime/artifact-store.js";
import { PythonBridge } from "../backend/validation/python-bridge.js";
import { ValidationLanePool } from "../backend/validation/validation-lane-pool.js";
import { DeterministicValidationRuntime } from "../backend/validation/deterministic-validation.js";
import { CanonicalContractSkill } from "../backend/skill/canonical-contract-skill.js";
import { FixtureResearchProvider } from "../backend/role/researcher/tool/fixture-provider.js";
import { ResearcherWorkflow } from "../backend/role/researcher/workflow.js";
import { PlannerWorkflow } from "../backend/role/planner/workflow.js";
import { RefactorWorkflow } from "../backend/role/refactor/workflow.js";
import { GapAnalysisWorkflow } from "../backend/role/gap-analysis/workflow.js";
import { EvaluationWorkflow } from "../backend/role/evaluation/workflow.js";
import { BuilderWorkflow } from "../backend/role/builder/workflow.js";
import { TripleValidationWorkflow } from "../backend/workflow/triple-validation.js";
import { ConfirmationWorkflow } from "../backend/workflow/confirmation.js";
import { HashWorkflow } from "../backend/workflow/hash.js";
import { WorkflowRuntime } from "../backend/runtime/workflow-runtime.js";
import { SandboxService } from "../backend/sandbox/sandbox-service.js";
import type {
  RunnerExecutionResult,
  SandboxRunner,
} from "../backend/sandbox/runner/runner.js";
import type { ExecutionAuthorization } from "../backend/sandbox/types.js";
import type { Plan } from "../backend/contract/types.js";

class DeterministicTestSandboxRunner implements SandboxRunner {
  async execute(
    _sandboxId: string,
    _workspacePath: string,
    _plan: Plan,
    auth: ExecutionAuthorization,
  ): Promise<RunnerExecutionResult> {
    return {
      commands: ["echo OneShot deterministic Builder test"],
      exit_codes: [0],
      stdout_lines: ["OneShot deterministic Builder test"],
      stderr_lines: [],
      file_changes: [],
      bytes_written: 0,
      resource_usage: {
        duration_ms: 0,
        peak_memory_mb: 0,
        cpu_time_ms: 0,
      },
      environment_allowlist_used: [...auth.environment_allowlist],
      network_policy_used: auth.network_policy,
      cleanup_result: {
        workspace_cleaned: false,
        processes_terminated: true,
      },
      condition: "success",
    };
  }

  async cleanup(_sandboxId: string, workspacePath: string): Promise<boolean> {
    rmSync(workspacePath, { recursive: true, force: true });
    return true;
  }
}

export function prompt(runId: string): Prompt {
  return {
    prompt_id: `prompt:${runId}`,
    intent: "Run canonical sample",
    requested_outcome: "Reach DONE",
    context: [{ context_id: `ctx:${runId}`, statement: "E2E" }],
    research_direction: ["contracts"],
  };
}

export async function harness(
  name: string,
  provider?: ResearchProvider,
  sandboxRunner: SandboxRunner = new DeterministicTestSandboxRunner(),
) {
  const taskStore = new AppendOnlyProcessingEventStore(
    resolve(`data/test-task-events/${name}-${process.pid}`),
  );
  const events = new ProcessingEventBus(taskStore);
  const runs = new RunRepository(resolve(`data/test-state/${name}`));
  const task = new TaskManagement(
    taskStore,
    new CheckpointStore(resolve(`data/test-checkpoints/${name}-${process.pid}`)),
  );

  events.observe((e) => {
    const snapshot = runs.get(e.run_id);
    if (!snapshot) return;
    runs.event(e.run_id, e);
    task.onEvent(e, runs.require(e.run_id));
  });

  provider?.attachEvents?.(events);

  // Canonical contract operations remain separate from the three independent
  // Triple Validation worker lanes.
  const bridge = new PythonBridge();
  const contracts = new CanonicalContractSkill(bridge);
  await contracts.verifyStatic();

  const validationLanes = new ValidationLanePool();
  const closeContractBridge = bridge.close.bind(bridge);
  bridge.close = () => {
    validationLanes.close();
    closeContractBridge();
  };

  const validation = new DeterministicValidationRuntime(validationLanes);
  const researcher = new ResearcherWorkflow(
    provider || new FixtureResearchProvider(),
    contracts,
  );
  const planner = new PlannerWorkflow(contracts);
  const refactor = new RefactorWorkflow(contracts);
  const gapper = new GapAnalysisWorkflow(contracts);
  const evaluator = new EvaluationWorkflow(contracts);
  const triple = new TripleValidationWorkflow(validation, contracts);
  const confirmation = new ConfirmationWorkflow(contracts);
  const hash = new HashWorkflow(contracts);
  const store = new FileArtifactStore(resolve(`data/test-runs/${name}`));

  const sandbox = new SandboxService(
    contracts,
    events,
    sandboxRunner,
    resolve(`data/test-builder-sandbox/${name}-${process.pid}`),
  );
  const builder = new BuilderWorkflow(sandbox);

  const runtime = new WorkflowRuntime(
    events,
    runs,
    store,
    researcher,
    planner,
    refactor,
    gapper,
    evaluator,
    triple,
    confirmation,
    hash,
    builder,
  );

  return {
    events,
    runs,
    task,
    bridge,
    validationLanes,
    contracts,
    validation,
    researcher,
    planner,
    refactor,
    gapper,
    evaluator,
    triple,
    confirmation,
    hash,
    sandbox,
    builder,
    store,
    runtime,
    close() {
      bridge.close();
    },
  };
}
