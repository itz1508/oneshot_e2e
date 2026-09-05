export const EvaluatorAgent = {
  id: "Evaluator",
  owns: ["evaluation evidence"]
} as const;

import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";

export class EvaluationWorkflow {
  // Evaluation workflow implementation
  // EVALUATION when applicable case exists
  // evaluate FINAL plan_id
  // compare expected behavior
  // preserve result
}