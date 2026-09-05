export const PlannerAgent = {
  id: "Planner",
  owns: ["audit_id"]
} as const;

import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";

export class PlannerWorkflow {
  // Planner workflow implementation
  // INPUT: plan_id
  // REVIEW: evidence sufficiency, file coverage, structure, design, goal clarity, fixture usability, unresolved conflicts
  // OUTPUT: audit_id
}