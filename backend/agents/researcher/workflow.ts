import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateText } from "ai";
import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";
import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import { ResearcherAgent } from "./agent.js";
import {
  buildResearchBundle,
  type StructuredResearchDraft,
} from "./structured-draft.js";
import {
  ResearchEvidenceCollector,
  type GatheredEvidence,
} from "./tool/evidence/collector.js";
import { resolveActiveIntegrationModel } from "../../integration/runtime.js";

const RESEARCHER_SYSTEM_PROMPT = `You are the OneShot Researcher agent.
Your responsibility is to analyze the user prompt and gathered evidence to produce a structured research draft.
Output ONLY a valid JSON object adhering to this schema:
{
  "summary": "Concise summary of research findings and direction",
  "requirements": ["Requirement 1 statement", "Requirement 2 statement"],
  "dependencies": [{"description": "Dependency statement", "required_by": [0]}],
  "plan_steps": [{"description": "Step description", "responsibility": "ResearchPlan", "requirement_indexes": [0]}],
  "success_meaning": "What success means for this request",
  "success_criteria": [{"statement": "Criterion statement", "measurement": "How to measure", "expected_result": "Expected result", "requirement_indexes": [0]}],
  "deliverable": "Optional implementation code or content"
}`;

export function parseStructuredDraft(text: string): StructuredResearchDraft {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }
  try {
    return JSON.parse(cleaned) as StructuredResearchDraft;
  } catch {
    throw new WorkflowRootCauseError({
      issue: "RESEARCH_MODEL_OUTPUT_INVALID_JSON",
      expected: "Model output is valid JSON adhering to StructuredResearchDraft",
      actual: text.slice(0, 500),
      evidence_ids: [],
      required_correction: "Ensure model returns valid structured JSON draft",
      recheck_target: "researcher",
    });
  }
}

export class ResearcherWorkflow {
  readonly agent = ResearcherAgent;
  private projectRoot: string;
  private collector: ResearchEvidenceCollector;

  constructor(
    private contracts: CanonicalContractSkill,
    private modelCapability?: unknown,
    projectRoot?: string,
  ) {
    this.projectRoot = projectRoot || process.cwd();
    this.collector = new ResearchEvidenceCollector(this.projectRoot);
  }

  async execute(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    return this.run(prompt, runId);
  }

  async run(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    await this.contracts.validate("urn:oneshot:schema:prompt:2", prompt);

    // 1. Gather repository & user prompt evidence
    const gathered = await this.collector.collect(prompt);

    // 2. Obtain structured research draft via available capability
    let draft: StructuredResearchDraft;
    let modelSource = "researcher:internal";
    let modelProvenance = "oneshot-researcher";

    // Case A: Test draft file override (for deterministic test suites)
    const testDraftFile = (
      process.env.ONESHOT_RESEARCH_TEST_DRAFT_FILE || ""
    ).trim();
    if (testDraftFile) {
      const p = resolve(this.projectRoot, testDraftFile);
      const raw = await readFile(p, "utf8");
      draft = JSON.parse(raw);
      modelSource = `file:${testDraftFile}`;
      modelProvenance = "test-draft-file";
    } else if (
      this.modelCapability &&
      typeof (this.modelCapability as any).generateDraft === "function"
    ) {
      // Case B: Explicit draft generator capability
      draft = await (this.modelCapability as any).generateDraft(
        prompt,
        gathered,
      );
      modelSource =
        (this.modelCapability as any).source || "capability:draft-generator";
      modelProvenance =
        (this.modelCapability as any).provenance || "custom-capability";
    } else if (typeof this.modelCapability === "function") {
      // Case C: Explicit draft generator function
      draft = await (this.modelCapability as any)(prompt, gathered);
      modelSource = "capability:function";
      modelProvenance = "custom-function";
    } else {
      // Case D: Generic AI SDK model provided or resolved from active integration
      let activeModel: any;
      if (
        this.modelCapability &&
        typeof (this.modelCapability as any).model === "object"
      ) {
        activeModel = (this.modelCapability as any).model;
        modelSource = (this.modelCapability as any).source || "model:direct";
        modelProvenance =
          (this.modelCapability as any).provenance || "ai-sdk";
      } else if (
        this.modelCapability &&
        typeof (this.modelCapability as any).doGenerate === "function"
      ) {
        activeModel = this.modelCapability;
        modelSource = "model:ai-sdk";
        modelProvenance = "ai-sdk-language-model";
      } else {
        // Inspect active runtime integration (e.g. backend/integration/gemini)
        const active = await resolveActiveIntegrationModel(this.projectRoot);
        if (active) {
          activeModel = active.model;
          modelSource = active.source;
          modelProvenance = active.provenance;
        }
      }

      if (activeModel) {
        const evidenceText = gathered
          .map((e) => `[${e.source}] ${e.statement}`)
          .join("\n");
        const promptText = `User Intent: ${prompt.intent}\nRequested Outcome: ${prompt.requested_outcome}\nContext:\n${evidenceText}`;

        const result = await generateText({
          model: activeModel,
          system: RESEARCHER_SYSTEM_PROMPT,
          prompt: promptText,
        });

        draft = parseStructuredDraft(result.text);
      } else {
        // Case E: No model capability or integration installed -> ROOT_CAUSE error
        throw new WorkflowRootCauseError({
          issue: "RESEARCH_CAPABILITY_UNAVAILABLE",
          expected:
            "Active integration model (e.g. Gemini via [+] Add Integration) or configured research draft",
          actual: "No research integration is installed or configured",
          evidence_ids: [],
          required_correction:
            "Install and configure Gemini under backend/integration/gemini or supply research requirements",
          recheck_target: runId,
        });
      }
    }

    // 3. Researcher interprets and validates structured draft and constructs ResearchBundle
    const bundle = await buildResearchBundle({
      projectRoot: this.projectRoot,
      prompt,
      runId,
      draft,
      gathered,
      modelSource,
      modelProvenance,
    });

    // 4. Validate produced bundle against canonical schemas
    const checks: [string, unknown][] = [
      ["urn:oneshot:schema:researcher:2", bundle.researcher],
      ["urn:oneshot:schema:plan:2", bundle.plan],
      ["urn:oneshot:schema:schema-artifact:2", bundle.schema_artifact],
      ["urn:oneshot:schema:fixture:2", bundle.fixture],
      ["urn:oneshot:schema:goal:2", bundle.goal],
      ["urn:oneshot:schema:validation:2", bundle.validation],
    ];
    for (const [id, v] of checks) await this.contracts.validate(id, v);

    return bundle;
  }
}
