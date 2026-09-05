import { node, type NodeContext } from "@google/adk";
import type { Evaluation, Plan, ResearchBundle } from "../../../contracts/schema/types.js";
import { EvaluationRole } from "../../../role/evaluation/role.js";
import type { EvaluationWorkflow } from "../../../role/evaluation/workflow.js";

export interface EvaluationNodeInput {
  job_id: string;
  research: ResearchBundle;
  plan: Plan;
}

export function createEvaluationNode(evaluator: EvaluationWorkflow) {
  return node(
    async (_ctx: NodeContext, input: EvaluationNodeInput): Promise<Evaluation> => {
      if (!/[A-Za-z]/.test(input.job_id)) {
        throw new Error("ADK job_id must contain at least one non-numeric character");
      }
      return await evaluator.run(input.research, input.plan);
    },
    { name: EvaluationRole.id },
  );
}
