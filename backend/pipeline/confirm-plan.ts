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

  await pipelineQueue.add(
    "planner",
    { runId },
    {
      jobId: plannerJobId,
    },
  );

  return {
    runId,
    plannerJobId,
    status: "planner_queued",
  };
}
