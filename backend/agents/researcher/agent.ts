export const ResearcherAgent = {
  id: "Researcher",
  owns: ["Researcher(id)", "plan_id", "schema_id", "fixture_id", "goal_id", "validation_id"]
} as const;

import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";

export class ResearcherWorkflow {
  // Researcher workflow implementation
  // Receives Prompt_id
  // Determines required evidence and requirements
  // Performs repository and external research
  // Preserves provenance
  // Synthesizes research
  // Produces Researcher(id)
  // Produces plan_id
}