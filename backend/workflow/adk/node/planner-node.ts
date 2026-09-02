import { node, type NodeContext } from "@google/adk";

import type { Audit, ResearchBundle } from "../../../contract/types.js";
import { PlannerRole } from "../../../role/planner/role.js";
import type { PlannerWorkflow } from "../../../role/planner/workflow.js";

export interface PlannerNodeInput {
  job_id: string;
  research: ResearchBundle;
}

/** ADK connector for the existing OneShot Planner Role. */
export function createPlannerNode(planner: PlannerWorkflow) {
  return node(
    async (
      _ctx: NodeContext,
      nodeInput: PlannerNodeInput,
    ): Promise<Audit> => {
      if (!nodeInput.job_id || !/[A-Za-z]/.test(nodeInput.job_id)) {
        throw new Error(
          "Planner ADK job_id must contain at least one non-numeric character",
        );
      }
      return await planner.run(nodeInput.research, nodeInput.job_id);
    },
    { name: PlannerRole.id },
  );
}
