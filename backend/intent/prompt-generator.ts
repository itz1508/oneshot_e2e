import type { Prompt } from "../contract/types.js";
import type { IntentState } from "./types.js";

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Converts a sufficient IntentState into the existing canonical Prompt(id).
 *
 * This is deliberately job-specific: Prompt(id) tells Researcher what this
 * job requires it to investigate. Permanent Researcher operating guidance
 * remains owned by the Researcher Role/Skill and is not copied here.
 */
export class PromptGenerator {
  generate(intent: IntentState, promptId: string): Prompt {
    if (!intent.ready_for_prompt || !intent.goal || !intent.requested_outcome) {
      throw new Error(
        `Intent ${intent.intent_id} is not ready for Prompt(id) generation`,
      );
    }

    const researchDirection = unique([
      `Establish the exact behavior required by this job-specific goal: ${intent.goal}`,
      `Determine the evidence-backed work needed to satisfy this requested outcome: ${intent.requested_outcome}`,
      ...intent.requirements.map(
        (requirement) =>
          `Investigate how to satisfy and prove this explicit user requirement without expanding its scope: ${requirement}`,
      ),
      ...intent.constraints.map(
        (constraint) =>
          `Determine the repository or runtime implications of this explicit user constraint and preserve it: ${constraint}`,
      ),
      `Use the accumulated conversation context for ${intent.intent_id} to resolve only job-specific research unknowns needed for the requested outcome; surface unsupported behavior as unknown instead of inventing product capability.`,
      `Define measurable evidence for the requested outcome and for any validation, verification, or proof explicitly requested in the accumulated conversation context.`,
    ]);

    return {
      prompt_id: promptId,
      intent: intent.goal,
      requested_outcome: intent.requested_outcome,
      context: intent.context.map((statement, index) => ({
        context_id: `intent-context:${intent.intent_id}:${index + 1}`,
        statement,
      })),
      research_direction: researchDirection,
    };
  }
}
