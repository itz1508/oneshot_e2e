import {
  pipelineQueue,
  stageJobId,
} from "./queue.js";
import type {
  ConfirmPlanInput,
  ConfirmPlanResult,
} from "./types.js";

export async function confirmPlan({
  runId,
  history,
}: ConfirmPlanInput): Promise<ConfirmPlanResult> {
  const researcherJobId = stageJobId(
    runId,
    "researcher",
  );

  const researcherJob =
    await pipelineQueue.getJob(researcherJobId);

  if (!researcherJob) {
    throw new Error(
      `Researcher result not found for run ${runId}`,
    );
  }

  const state = await researcherJob.getState();

  if (state !== "completed") {
    throw new Error(
      `Researcher is not complete. Current state: ${state}`,
    );
  }

  const plannerJobId = stageJobId(runId, "planner");
  const existingPlannerJob =
    await pipelineQueue.getJob(plannerJobId);
  const existingState = existingPlannerJob
    ? await existingPlannerJob.getState()
    : null;

  // Idempotent: a planner job that is waiting, delayed, active, or completed
  // means the user already confirmed. Re-emitting "confirmed" is fine; we must
  // NOT enqueue a second planner job.
  if (
    existingState === "waiting" ||
    existingState === "delayed" ||
    existingState === "active" ||
    existingState === "completed"
  ) {
    await history?.append({
      runId,
      stage: "await-human",
      type: "confirmed",
      message: `Planner job ${plannerJobId} already exists (${existingState}); confirmation is idempotent`,
    });
    return {
      runId,
      plannerJobId,
      status: "planner_already_queued",
    };
  }

  await pipelineQueue.add(
    "planner",
    { runId },
    {
      jobId: plannerJobId,
    },
  );

  await history?.append({
    runId,
    stage: "await-human",
    type: "confirmed",
    message: `Enqueued planner job ${plannerJobId}`,
  });

  return {
    runId,
    plannerJobId,
    status: "planner_queued",
  };
}
