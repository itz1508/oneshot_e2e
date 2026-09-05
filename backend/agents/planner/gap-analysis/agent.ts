export const GapAnalysisAgent = {
  id: "GapAnalysis",
  owns: ["gap records", "gap_0"]
} as const;

import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";

export class GapAnalysisWorkflow {
  // Gap Analysis workflow implementation
  // Workflow: updated plan_id → inspect → gap_1 ... gap_n → fix gaps → recheck → gap_0 → FINAL plan_id
  // Preserves the invariant: FINAL plan_id >= Job requirements
}