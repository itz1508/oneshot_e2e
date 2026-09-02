import { node, type NodeContext } from "@google/adk";
import type {
  Audit,
  ConfirmedPackage,
  Evaluation,
  GapAnalysis,
  Plan,
  ResearchBundle,
  TripleValidation,
} from "../../../contract/types.js";
import type { ConfirmationWorkflow } from "../../confirmation.js";

export interface ConfirmationNodeInput {
  job_id: string;
  research: ResearchBundle;
  plan: Plan;
  audit: Audit;
  gap: GapAnalysis;
  evaluation: Evaluation;
  triple: TripleValidation;
}

export function createConfirmationNode(confirmation: ConfirmationWorkflow) {
  return node(
    async (_ctx: NodeContext, input: ConfirmationNodeInput): Promise<ConfirmedPackage> => {
      if (!/[A-Za-z]/.test(input.job_id)) {
        throw new Error("ADK job_id must contain at least one non-numeric character");
      }
      return await confirmation.run(
        input.research,
        input.plan,
        input.audit,
        input.gap,
        input.evaluation,
        input.triple,
      );
    },
    { name: "Confirmed" },
  );
}
