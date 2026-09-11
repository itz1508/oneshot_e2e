import { ToolRegistry } from "../../../tool/registry.js";
import type { Prompt, ResearchBundle } from "../../../contracts/schema/types.js";
import { WorkflowRootCauseError } from "../../../core/root-cause-error.js";

export function researcherTools(
  researchFn?: (prompt: Prompt, runId: string) => Promise<ResearchBundle>,
) {
  const r = new ToolRegistry();
  r.register<{ prompt: Prompt; runId: string }, ResearchBundle>(
    {
      name: "research",
      description: "Produce the canonical Researcher-owned research bundle.",
    },
    async ({ prompt, runId }) => {
      if (!researchFn) {
        throw new WorkflowRootCauseError({
          issue: "RESEARCH_CAPABILITY_UNAVAILABLE",
          expected: "Active integration model or research capability",
          actual: "No research capability is available",
          evidence_ids: [],
          required_correction: "Configure an integration under backend/integration/gemini or supply research requirements",
          recheck_target: runId,
        });
      }
      return researchFn(prompt, runId);
    },
  );
  return r;
}
