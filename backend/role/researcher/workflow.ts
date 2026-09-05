import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import { researcherTools } from "./tool/registry.js";
import type { ResearchProvider } from "./provider.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";
import { ResearcherRole } from "./role.js";

export class ResearcherWorkflow {
  readonly role = ResearcherRole;
  private tools: ReturnType<typeof researcherTools>;
  constructor(provider: ResearchProvider, private contracts: CanonicalContractSkill) {
    this.tools = researcherTools(provider);
  }
  async run(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    await this.contracts.validate("urn:oneshot:schema:prompt:1", prompt);
    const b = await this.tools.invoke<{ prompt: Prompt; runId: string }, ResearchBundle>("research", { prompt, runId });
    const checks: [string, unknown][] = [
      ["urn:oneshot:schema:researcher:1", b.researcher],
      ["urn:oneshot:schema:plan:1", b.plan],
      ["urn:oneshot:schema:schema-artifact:1", b.schema_artifact],
      ["urn:oneshot:schema:fixture:1", b.fixture],
      ["urn:oneshot:schema:goal:1", b.goal],
      ["urn:oneshot:schema:validation:1", b.validation],
    ];
    for (const [id, v] of checks) await this.contracts.validate(id, v);
    return b;
  }
}
