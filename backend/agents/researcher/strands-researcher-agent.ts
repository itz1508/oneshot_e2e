import { z } from "zod";
import { Agent } from "../../../app/integration/strands/src/index.js";
import type { OpenAIModel } from "../../../app/integration/strands/src/index.js";
import {
  createWorkspaceEvidenceTool,
  createTavilyResearchTool,
  type FactListener,
  type ResearchEvidenceRecorder,
} from "./strands-tools.js";
import type { StructuredResearchDraft } from "./structured-draft.js";

export const STRUCTURED_RESEARCH_SCHEMA = z.object({
  summary: z.string(),
  requirements: z.array(z.string()),
  dependencies: z.array(
    z.object({
      description: z.string(),
      required_by: z.array(z.number().int().nonnegative()),
    }),
  ),
  plan_steps: z.array(
    z.object({
      description: z.string(),
      responsibility: z.string(),
      requirement_indexes: z.array(z.number().int().nonnegative()),
    }),
  ),
  success_meaning: z.string(),
  success_criteria: z.array(
    z.object({
      statement: z.string(),
      measurement: z.string(),
      expected_result: z.string(),
      requirement_indexes: z.array(z.number().int().nonnegative()),
    }),
  ),
  deliverable: z.string().optional(),
});

export const RESEARCHER_SYSTEM_PROMPT = `You are the OneShot Researcher agent.
Your objective is to inspect local workspace evidence and external technical documentation to form an authoritative research draft.
You must use your tools (workspace_read_file and tavily_search_extract) when context is required.
Output your findings adhering strictly to the structured output schema.`;

export class StrandsResearcherAgent {
  private agent: Agent;

  constructor(
    model: OpenAIModel,
    projectRoot: string,
    tavilyApiKey?: string,
    private onFact?: FactListener,
    recorder?: ResearchEvidenceRecorder,
  ) {
    const workspaceTool = createWorkspaceEvidenceTool(projectRoot, recorder);
    const tavilyTool = createTavilyResearchTool(tavilyApiKey, onFact, recorder);

    this.agent = new Agent({
      model,
      systemPrompt: RESEARCHER_SYSTEM_PROMPT,
      tools: [workspaceTool, tavilyTool],
    });
  }

  async runResearch(promptText: string): Promise<StructuredResearchDraft> {
    this.onFact?.({
      type: "strandsInvoked",
      timestamp: new Date().toISOString(),
      stage: "Researcher",
      source: "Strands:Agent",
      operation: "Agent.invoke",
    });

    const result = await this.agent.invoke(promptText, {
      structuredOutputSchema: STRUCTURED_RESEARCH_SCHEMA,
    });

    if (!result.structuredOutput) {
      throw new Error("Strands Agent invocation failed to return structuredOutput.");
    }

    const draft = STRUCTURED_RESEARCH_SCHEMA.parse(result.structuredOutput);

    this.onFact?.({
      type: "researcherDraftProduced",
      timestamp: new Date().toISOString(),
      stage: "Researcher",
      source: "Strands:structuredOutput",
      operation: "runResearch",
      metadata: {
        summaryLength: draft.summary?.length || 0,
        requirementsCount: draft.requirements?.length || 0,
        stepsCount: draft.plan_steps?.length || 0,
      },
    });

    return draft;
  }
}
