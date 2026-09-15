import type { ModelCapability } from "../../integration/core/capability.js";
import type { ResearchMode } from "../../integration/core/policy.js";
import type { ModelTransport } from "../../integration/core/types.js";

/**
 * What the Researcher workflow DEMANDS from the execution layer (M3).
 *
 * This is a canonical, versioned descriptor. It never includes credentials
 * and never chooses a concrete provider, endpoint, or model — that is the
 * deterministic router's job (M7), which consumes this to produce a
 * `ResolvedExecutionRoute`. Runtime, provider, model, capabilities,
 * transport, and research mode are all described here as REQUIREMENTS, not
 * choices.
 */
export interface WorkflowRequirements {
  readonly workflowId: string;
  readonly requiredCapabilities: readonly ModelCapability[];
  readonly preferredTransports: readonly ModelTransport[];
  readonly researchMode: ResearchMode;
  readonly requiresToolUse: boolean;
  readonly requiresStructuredOutput: boolean;
}

export interface ExecutionRequirements {
  readonly workflowId: string;
  readonly requirements: WorkflowRequirements;
  readonly generatedAt: string;
  readonly version: string;
}

export const RESEARCHER_WORKFLOW_ID = "researcher";
export const EXECUTION_REQUIREMENTS_VERSION = "1";

/**
 * Build the Researcher's execution requirements. `researchMode` is supplied by
 * the caller (the workflow derives a default from Tavily availability); the
 * requirements object itself carries no credentials. The research policy
 * router (M12) may still refine the mode (e.g. force `local-only`).
 */
export function researcherExecutionRequirements(
  researchMode: ResearchMode = "disabled",
): ExecutionRequirements {
  return {
    workflowId: RESEARCHER_WORKFLOW_ID,
    requirements: {
      workflowId: RESEARCHER_WORKFLOW_ID,
      // Researcher needs Tavily tool-use and a StructuredResearchDraft.
      requiredCapabilities: ["tool-use", "structured-output"],
      // Strands drives the model via its OpenAI-compatible chat transport.
      preferredTransports: ["openai-chat"],
      researchMode,
      requiresToolUse: true,
      requiresStructuredOutput: true,
    },
    generatedAt: new Date().toISOString(),
    version: EXECUTION_REQUIREMENTS_VERSION,
  };
}
