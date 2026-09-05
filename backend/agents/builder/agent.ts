export const BuilderAgent = {
  id: "Builder",
  owns: ["sandbox execution handoff", "build execution evidence"]
} as const;

import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";

export class BuilderWorkflow {
  // Builder workflow implementation
  // Builder entry contract: Prompt_id + Plan_id
  // Builder Execution → Build Result → Hash Verification → DONE
}