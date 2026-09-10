import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import type { ModelProvider } from "../../provider/model-provider.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";
import { ResearcherAgent } from "./agent.js";
import { researchDraftToBundle } from "./bundle-builder.js";
import {
  parseResearchDraft,
  RESEARCH_DRAFT_SHAPE,
  sampleResearchDraft,
} from "./draft.js";
import { ResearchEvidenceCollector } from "./tool/evidence/collector.js";
import { researcherTools } from "./tool/registry.js";

/**
 * Backend Researcher role.
 *
 * Researcher owns evidence collection, role instructions, structured-draft
 * validation/retry, and canonical ResearchBundle construction. Model providers
 * are transport-only dependencies and never receive/return ResearchBundle.
 */
export class ResearcherWorkflow {
  readonly agent = ResearcherAgent;
  private readonly evidence: ResearchEvidenceCollector;

  constructor(
    private readonly provider: ModelProvider | undefined,
    private readonly contracts: CanonicalContractSkill,
    private readonly projectRoot = process.env.ONESHOT_ROOT || process.cwd(),
  ) {
    this.evidence = new ResearchEvidenceCollector(projectRoot);
  }

  private async liveDraft(prompt: Prompt, runId: string) {
    const provider = this.provider;
    if (!provider) return sampleResearchDraft(prompt);

    const gathered = await this.evidence.collect(prompt);
    const tools = researcherTools(provider);
    const system = [
      "You are the OneShot Researcher backend role.",
      "Return exactly one JSON object matching the requested Researcher draft shape.",
      "Use only the supplied prompt and evidence.",
      "Preserve explicit user constraints and commands.",
      "Requirement indexes are zero-based indexes into requirements.",
      "Do not invent unrelated architecture or implementation claims.",
      "No markdown fences or prose outside the JSON object.",
    ].join(" ");
    const basePrompt = JSON.stringify({
      prompt,
      evidence: gathered,
      output_shape: RESEARCH_DRAFT_SHAPE,
    });
    const retries = Math.max(
      0,
      Number.parseInt(process.env.ONESHOT_RESEARCHER_DRAFT_RETRIES || "2", 10) || 0,
    );

    let raw = await tools.invoke<
      { system: string; prompt: string; maxOutputTokens: number; temperature?: number },
      string
    >("generate_text", {
      system,
      prompt: basePrompt,
      maxOutputTokens: Number(process.env.ONESHOT_RESEARCHER_MAX_OUTPUT_TOKENS || 4096),
      temperature: process.env.ONESHOT_RESEARCHER_TEMPERATURE
        ? Number(process.env.ONESHOT_RESEARCHER_TEMPERATURE)
        : undefined,
    });

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return { draft: parseResearchDraft(raw), gathered };
      } catch (error) {
        if (attempt >= retries) {
          throw new WorkflowRootCauseError({
            issue: "Researcher model output failed structured-draft validation",
            expected: "One strict Researcher draft JSON object",
            actual: error instanceof Error ? error.message : "invalid model output",
            evidence_ids: [],
            required_correction:
              "Correct Researcher instructions/model output and retry the same prompt",
            recheck_target: runId,
          });
        }
        const correction =
          error instanceof Error ? error.message : "invalid Researcher draft";
        raw = await tools.invoke<
          { system: string; prompt: string; maxOutputTokens: number; temperature?: number },
          string
        >("generate_text", {
          system,
          prompt: `${basePrompt}\n\nPrevious output was rejected: ${correction}\nReturn a corrected JSON object only.`,
          maxOutputTokens: Number(process.env.ONESHOT_RESEARCHER_MAX_OUTPUT_TOKENS || 4096),
          temperature: process.env.ONESHOT_RESEARCHER_TEMPERATURE
            ? Number(process.env.ONESHOT_RESEARCHER_TEMPERATURE)
            : undefined,
        });
      }
    }
    throw new Error("Researcher draft retry loop exhausted");
  }

  async run(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    await this.contracts.validate("urn:oneshot:schema:prompt:2", prompt);

    let draft;
    let gathered;
    let modelSource: string;
    let modelProvenance: string;

    if (this.provider) {
      const live = await this.liveDraft(prompt, runId);
      draft = live.draft;
      gathered = live.gathered;
      modelSource = `model:${this.provider.id}:${this.provider.model}`;
      modelProvenance = `ai-sdk:${this.provider.id}`;
    } else {
      // Sample mode is Researcher-owned deterministic behavior, not a Provider.
      gathered = await this.evidence.collect(prompt);
      draft = sampleResearchDraft(prompt);
      modelSource = `researcher-sample:${prompt.prompt_id}`;
      modelProvenance = "deterministic-researcher-sample";
    }

    const bundle = await researchDraftToBundle({
      projectRoot: this.projectRoot,
      prompt,
      runId,
      draft,
      gathered,
      modelSource,
      modelProvenance,
    });

    const checks: [string, unknown][] = [
      ["urn:oneshot:schema:researcher:2", bundle.researcher],
      ["urn:oneshot:schema:plan:2", bundle.plan],
      ["urn:oneshot:schema:schema-artifact:2", bundle.schema_artifact],
      ["urn:oneshot:schema:fixture:2", bundle.fixture],
      ["urn:oneshot:schema:goal:2", bundle.goal],
      ["urn:oneshot:schema:validation:2", bundle.validation],
    ];
    for (const [id, value] of checks) await this.contracts.validate(id, value);
    return bundle;
  }
}
