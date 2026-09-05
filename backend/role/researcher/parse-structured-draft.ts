/**
 * parse-structured-draft — THE single authoritative ResearchDraft parser and
 * validator for every provider (OpenAI, Anthropic, Gemini, Featherless).
 *
 * Providers never know this exists: they return normalized ModelResponse text,
 * and the Researcher boundary funnels all of them through this one strict
 * parser. Malformed output fails closed with a sanitized root cause — no raw
 * provider material is echoed into the workflow or UI.
 */
import type { StructuredResearchDraft } from "./structured-draft.js";
import { WorkflowRootCauseError } from "../../core/root-cause-error.js";

function stripFences(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*(.*?)\s*```$/s);
  return (fenced ? fenced[1] : text).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, min = 1): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function indexesInBounds(value: unknown, max: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.every((i) => Number.isInteger(i) && i >= 0 && i < max)
  );
}

/**
 * Strict structural validation of one model-produced ResearchDraft.
 * Fails closed: nothing is invented, no partial draft is returned, and the
 * resulting root cause carries only a sanitized rejection reason.
 */
export function parseStructuredDraft(
  text: string,
  provider: string,
): StructuredResearchDraft {
  const reject = (reason: string): WorkflowRootCauseError =>
    new WorkflowRootCauseError({
      issue: `${provider} model response rejected: research draft ${reason}`,
      expected:
        "a structured ResearchDraft: summary, requirements, plan_steps, success_meaning, success_criteria, and a non-empty deliverable",
      actual: `${reason}; provider response was rejected`,
      evidence_ids: [],
      required_correction: `Correct the ${provider} model instruction or response format`,
      recheck_target: provider,
    });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw reject("is not valid JSON");
  }
  if (!isRecord(parsed)) throw reject("is not a JSON object");

  const draft = parsed as Record<string, unknown>;
  const fail = (field: string) => reject(`field ${field} is missing or invalid`);

  if (typeof draft.summary !== "string" || !draft.summary.trim()) throw fail("summary");
  if (!stringArray(draft.requirements)) throw fail("requirements");
  if (
    !Array.isArray(draft.success_criteria) ||
    draft.success_criteria.length === 0
  )
    throw fail("success_criteria");
  if (
    typeof draft.success_meaning !== "string" ||
    !draft.success_meaning.trim()
  )
    throw fail("success_meaning");
  if (typeof draft.deliverable !== "string" || !draft.deliverable.trim())
    throw fail("deliverable");

  if (!Array.isArray(draft.plan_steps) || draft.plan_steps.length === 0)
    throw fail("plan_steps");
  for (const step of draft.plan_steps) {
    if (
      !isRecord(step) ||
      typeof step.description !== "string" ||
      !step.description.trim() ||
      typeof step.responsibility !== "string" ||
      !step.responsibility.trim() ||
      !indexesInBounds(step.requirement_indexes, draft.requirements.length)
    ) {
      throw fail("plan_steps");
    }
  }

  for (const criterion of draft.success_criteria) {
    if (
      !isRecord(criterion) ||
      typeof criterion.statement !== "string" ||
      !criterion.statement.trim() ||
      typeof criterion.measurement !== "string" ||
      typeof criterion.expected_result !== "string" ||
      !indexesInBounds(criterion.requirement_indexes, draft.requirements.length)
    ) {
      throw fail("success_criteria");
    }
  }

  if (draft.dependencies !== undefined && !Array.isArray(draft.dependencies))
    throw fail("dependencies");

  return parsed as unknown as StructuredResearchDraft;
}