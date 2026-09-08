import { node, type NodeContext } from "@google/adk";

import type {
  Audit,
  Plan,
  ResearchBundle,
} from "../../../contracts/schema/types.js";
import { RefactorAgent } from "../../../agents/refactor/agent.js";
import type { RefactorWorkflow } from "../../../agents/refactor/workflow.js";

export interface RefactorNodeInput {
  job_id: string;
  research: ResearchBundle;
  audit: Audit;
}

/** ADK connector for the existing OneShot Refactor Agent. */
export function createRefactorNode(refactor: RefactorWorkflow) {
  return node(
    async (_ctx: NodeContext, nodeInput: RefactorNodeInput): Promise<Plan> => {
      if (!nodeInput.job_id || !/[A-Za-z]/.test(nodeInput.job_id)) {
        throw new Error(
          "Refactor ADK job_id must contain at least one non-numeric character",
        );
      }
      return await refactor.run(nodeInput.research, nodeInput.audit);
    },
    { name: RefactorAgent.id },
  );
}
