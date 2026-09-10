import { ToolRegistry } from "../../../tool/registry.js";
import type { Prompt, ResearchBundle } from "../../../contracts/schema/types.js";
import { createFixtureResearchBundle } from "../fixture.js";

export function researcherTools(
  researchFn?: (prompt: Prompt, runId: string) => Promise<ResearchBundle>,
) {
  const r = new ToolRegistry();
  const fn = researchFn ?? ((prompt, runId) => createFixtureResearchBundle(prompt, runId));
  r.register<{ prompt: Prompt; runId: string }, ResearchBundle>(
    {
      name: "research",
      description:
        "Produce the canonical Researcher-owned research bundle.",
    },
    ({ prompt, runId }) => fn(prompt, runId),
  );
  return r;
}
