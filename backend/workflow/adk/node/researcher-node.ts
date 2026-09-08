import { node, type NodeContext } from "@google/adk";

import type {
  Prompt,
  ResearchBundle,
} from "../../../contracts/schema/types.js";
import { ResearcherAgent } from "../../../agents/researcher/agent.js";
import type { ResearcherWorkflow } from "../../../agents/researcher/workflow.js";

export interface ResearcherNodeInput {
  job_id: string;
  prompt: Prompt;
}

/**
 * ADK connector for the existing OneShot Researcher Agent.
 *
 * ADK owns node execution/lifecycle. The existing ResearcherWorkflow remains
 * the Agent implementation and continues to enforce the canonical Prompt and
 * ResearchBundle contracts.
 */
export function createResearcherNode(researcher: ResearcherWorkflow) {
  return node(
    async (
      _ctx: NodeContext,
      nodeInput: ResearcherNodeInput,
    ): Promise<ResearchBundle> => {
      if (!nodeInput.job_id || !/[A-Za-z]/.test(nodeInput.job_id)) {
        throw new Error(
          "Researcher ADK job_id must contain at least one non-numeric character",
        );
      }
      return await researcher.run(nodeInput.prompt, nodeInput.job_id);
    },
    { name: ResearcherAgent.id },
  );
}
