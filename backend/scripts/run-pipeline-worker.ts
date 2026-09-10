#!/usr/bin/env node
/**
 * Standalone per-stage pipeline worker.
 *
 * Runs the new BullMQ-based stage worker in a dedicated process.
 * When the main server is switched to per-stage mode, it can also
 * construct this worker in-process; this script exists for detached
 * or replicated deployments.
 */

import "../environment.js";
import { resolve } from "node:path";
import { ProcessingEventBus } from "../runtime/event-bus.js";
import { RunRepository } from "../runtime/run-repository.js";
import { FileArtifactStore } from "../runtime/artifact-store.js";
import { AppendOnlyProcessingEventStore } from "../task/event/event-store.js";
import { CheckpointStore } from "../task/checkpoint/checkpoint-store.js";
import { TaskManagement } from "../task/task-management.js";
import { ProviderManager } from "../provider/manager.js";
import { CanonicalContractSkill } from "../skills/canonical-contract-skill.js";
import { createSkillSystem } from "../skills/bootstrap.js";
import { SandboxService } from "../sandbox/sandbox-service.js";
import { HardenedProcessRunner } from "../sandbox/runner/process-runner.js";
import { ContainerSandboxRunner } from "../sandbox/runner/container-runner.js";
import { ValidationLanePool } from "../validation/validation-lane-pool.js";
import { DeterministicValidationRuntime } from "../validation/deterministic-validation.js";
import { PythonBridge } from "../validation/python-bridge.js";
import { getRuntimePaths, ensureRuntimeDirectories } from "../runtime/runtime-config.js";
import { createPipelineWorker } from "../pipeline/worker.js";
import { PipelineHistory } from "../pipeline/history.js";
import { getSharedRedis } from "../runtime/redis-connection.js";
import type { StageServices } from "../pipeline/processors.js";
import { saveArtifact } from "../pipeline/context.js";
import { PlannerWorkflow } from "../agents/planner/workflow.js";
import { RefactorWorkflow } from "../agents/refactor/workflow.js";
import { GapAnalysisWorkflow } from "../agents/gap-analysis/workflow.js";
import { EvaluationWorkflow } from "../agents/evaluation/workflow.js";
import { BuilderWorkflow } from "../agents/builder/workflow.js";
import { TripleValidationWorkflow } from "../workflow/triple-validation.js";
import { ConfirmationWorkflow } from "../workflow/confirmation.js";
import { HashWorkflow } from "../workflow/hash.js";
import { createPythonReasoner } from "../reasoning/python-client.js";

const projectRoot = process.env.ONESHOT_ROOT || process.cwd();
const runtimePaths = ensureRuntimeDirectories(getRuntimePaths(projectRoot));

const taskEventStore = new AppendOnlyProcessingEventStore(runtimePaths.taskEvents);
const events = new ProcessingEventBus(taskEventStore);
const runs = new RunRepository(runtimePaths.runState);
const task = new TaskManagement(
  taskEventStore,
  new CheckpointStore(runtimePaths.checkpoints),
);

events.observe((e) => {
  const snapshot = runs.get(e.run_id);
  if (!snapshot) return;
  runs.event(e.run_id, e);
  task.onEvent(e, runs.require(e.run_id));
});

async function main() {
  const providerManager = new ProviderManager({
    projectRoot,
    runtimePaths,
  });

  const bridge = new PythonBridge();
  const validationLanes = new ValidationLanePool();
  const skills = createSkillSystem();
  const runtimeCtx = {
    caller_id: "backend/pipeline-worker",
    bridge,
    events,
    services: { task, runs } as Record<string, unknown>,
  };

  const contractsSkill = await skills.activation.activate(
    { skill_id: "oneshot-canonical-contracts" },
    runtimeCtx,
  );
  const contracts = contractsSkill.underlying as CanonicalContractSkill;
  await contracts.verifyStatic();

  const sandbox = new SandboxService(
    contracts,
    events,
    process.env.ONESHOT_SANDBOX_RUNNER === "container"
      ? new ContainerSandboxRunner()
      : new HardenedProcessRunner(),
    runtimePaths.sandboxWorkspaces,
  );

  const deterministic = new DeterministicValidationRuntime(validationLanes);
  const triple = new TripleValidationWorkflow(deterministic, contracts);
  const confirmation = new ConfirmationWorkflow(contracts);
  const hashWorkflow = new HashWorkflow(contracts);

  const services: StageServices = {
    events,
    providerManager,
    contracts,
    planner: new PlannerWorkflow(contracts),
    refactor: new RefactorWorkflow(contracts),
    gapper: new GapAnalysisWorkflow(contracts),
    evaluator: new EvaluationWorkflow(contracts),
    triple,
    confirmation,
    hash: hashWorkflow,
    builder: new BuilderWorkflow(sandbox),
    saveArtifact,
    pythonReasoner: createPythonReasoner(),
  };

  const worker = createPipelineWorker({
    runs,
    store: new FileArtifactStore(runtimePaths.runs),
    services,
    redis: getSharedRedis(),
    /*
     * The worker owns stage execution, so it also owns the durable per-stage
     * history stream (started/completed/skipped/waiting). GET /history reads
     * the same Redis stream from the API process.
     */
    history: new PipelineHistory(getSharedRedis()),
    concurrency: Number(process.env.ONESHOT_PIPELINE_CONCURRENCY || 1),
  });

  console.log(
    `ONESHOT_PIPELINE_WORKER_READY queue=oneshot-pipeline concurrency=${process.env.ONESHOT_PIPELINE_CONCURRENCY || 1}`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[OneShot] received ${signal}. Closing worker.`);
    await worker.close();
    validationLanes.close();
    bridge.close();
    providerManager.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(
    "pipeline-worker failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
