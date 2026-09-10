import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import { researcherTools } from "./tool/registry.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";
import { ResearcherAgent } from "./agent.js";

export class ResearcherWorkflow {
  readonly agent = ResearcherAgent;
  private tools: ReturnType<typeof researcherTools>;
  private researchTool: ((prompt: Prompt, runId: string) => Promise<any>) | undefined;
  constructor(
    private contracts: CanonicalContractSkill,
    modelCapability?: unknown,
  ) {
    if (typeof modelCapability === "function") {
      this.researchTool = modelCapability as (prompt: Prompt, runId: string) => Promise<ResearchBundle>;
    } else if (modelCapability && typeof (modelCapability as any).research === "function") {
      this.researchTool = (modelCapability as any).research.bind(modelCapability);
    }
    this.tools = researcherTools(this.researchTool);
  }
  async run(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    await this.contracts.validate("urn:oneshot:schema:prompt:2", prompt);
    const b = await this.tools.invoke<
      { prompt: Prompt; runId: string },
      ResearchBundle
    >("research", { prompt, runId });
    const checks: [string, unknown][] = [
      ["urn:oneshot:schema:researcher:2", b.researcher],
      ["urn:oneshot:schema:plan:2", b.plan],
      ["urn:oneshot:schema:schema-artifact:2", b.schema_artifact],
      ["urn:oneshot:schema:fixture:2", b.fixture],
      ["urn:oneshot:schema:goal:2", b.goal],
      ["urn:oneshot:schema:validation:2", b.validation],
    ];
    for (const [id, v] of checks) await this.contracts.validate(id, v);
    return b;
  }
}
