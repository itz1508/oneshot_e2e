import type { PipelineTransition } from "../workflow/canonical-transition.js";
import type { PipelineCheckpoints, StageIdentity } from "./checkpoints.js";
import type { PipelineIssue, PipelineStage } from "./stage-outcome.js";

export interface TransitionQueue {
  add(name: string, data: { version: 2; runId: string; stage: PipelineStage; iteration: number }, options: {
    jobId: string; attempts: number; backoff: { type: "exponential"; delay: number };
  }): Promise<unknown>;
}

export interface TransitionServices {
  queue: TransitionQueue;
  checkpoints: PipelineCheckpoints;
  waitForHuman(runId: string): Promise<void>;
  finish(runId: string, testResult: "Passed" | "Failed", issue?: PipelineIssue): Promise<void>;
}

export async function applyTransition(identity: StageIdentity, transition: PipelineTransition, services: TransitionServices): Promise<void> {
  const state = await services.checkpoints.getTransitionState(identity);
  if (state === "committed") return;
  if (state === "none") await services.checkpoints.markTransitionPending(identity);

  switch (transition.type) {
    case "next": {
      if (transition.finalization) {
        await services.checkpoints.saveFinalizationIntent(identity.runId, transition.finalization);
      }
      const jobId = `v2-${identity.runId}-${transition.stage}-${transition.iteration}`;
      await services.queue.add(transition.stage, {
        version: 2,
        runId: identity.runId,
        stage: transition.stage,
        iteration: transition.iteration,
      }, { jobId, attempts: 3, backoff: { type: "exponential", delay: 2_000 } });
      break;
    }
    case "wait-human":
      await services.waitForHuman(identity.runId);
      break;
    case "done":
      await services.finish(identity.runId, transition.test_result, transition.issue);
      break;
    default:
      return assertNever(transition);
  }
  await services.checkpoints.markTransitionCommitted(identity);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled transition: ${JSON.stringify(value)}`);
}
