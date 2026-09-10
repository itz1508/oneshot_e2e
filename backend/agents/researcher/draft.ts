import type { Prompt } from "../../contracts/schema/types.js";
import type { StructuredResearchDraft } from "./bundle-builder.js";

const TOP_LEVEL_KEYS = new Set([
  "deliverable",
  "summary",
  "requirements",
  "dependencies",
  "plan_steps",
  "success_meaning",
  "success_criteria",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function indexArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item))) {
    throw new Error(`${label} must be an integer array`);
  }
  return value as number[];
}

function jsonObjectText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("model response did not contain a JSON object");
  return candidate.slice(start, end + 1);
}

/** Strict Researcher-owned parser for model output. */
export function parseResearchDraft(raw: string): StructuredResearchDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonObjectText(raw));
  } catch (error) {
    throw new Error(
      error instanceof Error ? `invalid Researcher JSON: ${error.message}` : "invalid Researcher JSON",
    );
  }

  const input = record(parsed, "research draft");
  const extras = Object.keys(input).filter((key) => !TOP_LEVEL_KEYS.has(key));
  if (extras.length) throw new Error(`unexpected research draft field(s): ${extras.join(", ")}`);

  if (!Array.isArray(input.requirements) || input.requirements.length === 0) {
    throw new Error("requirements must be a non-empty array");
  }
  if (!Array.isArray(input.plan_steps) || input.plan_steps.length === 0) {
    throw new Error("plan_steps must be a non-empty array");
  }
  if (!Array.isArray(input.success_criteria) || input.success_criteria.length === 0) {
    throw new Error("success_criteria must be a non-empty array");
  }
  if (!Array.isArray(input.dependencies)) {
    throw new Error("dependencies must be an array");
  }

  const requirements = input.requirements.map((value, index) =>
    stringValue(value, `requirements[${index}]`),
  );

  const dependencies = input.dependencies.map((value, index) => {
    const item = record(value, `dependencies[${index}]`);
    return {
      description: stringValue(item.description, `dependencies[${index}].description`),
      required_by: indexArray(item.required_by, `dependencies[${index}].required_by`),
    };
  });

  const plan_steps = input.plan_steps.map((value, index) => {
    const item = record(value, `plan_steps[${index}]`);
    return {
      description: stringValue(item.description, `plan_steps[${index}].description`),
      responsibility: stringValue(item.responsibility, `plan_steps[${index}].responsibility`),
      requirement_indexes: indexArray(
        item.requirement_indexes,
        `plan_steps[${index}].requirement_indexes`,
      ),
    };
  });

  const success_criteria = input.success_criteria.map((value, index) => {
    const item = record(value, `success_criteria[${index}]`);
    return {
      statement: stringValue(item.statement, `success_criteria[${index}].statement`),
      measurement: stringValue(item.measurement, `success_criteria[${index}].measurement`),
      expected_result: stringValue(
        item.expected_result,
        `success_criteria[${index}].expected_result`,
      ),
      requirement_indexes: indexArray(
        item.requirement_indexes,
        `success_criteria[${index}].requirement_indexes`,
      ),
    };
  });

  const referencedIndexes = [
    ...dependencies.flatMap((item) => item.required_by),
    ...plan_steps.flatMap((item) => item.requirement_indexes),
    ...success_criteria.flatMap((item) => item.requirement_indexes),
  ];
  if (referencedIndexes.some((index) => index < 0 || index >= requirements.length)) {
    throw new Error("requirement indexes must reference the requirements array");
  }

  return {
    ...(typeof input.deliverable === "string" && input.deliverable.trim()
      ? { deliverable: input.deliverable }
      : {}),
    summary: stringValue(input.summary, "summary"),
    requirements,
    dependencies,
    plan_steps,
    success_meaning: stringValue(input.success_meaning, "success_meaning"),
    success_criteria,
  };
}

/**
 * Deterministic sample-mode Researcher draft. This is a Researcher test/runtime
 * source, not a provider and not part of Provider Configuration.
 */
export function sampleResearchDraft(prompt: Prompt): StructuredResearchDraft {
  const outcome = prompt.requested_outcome.trim() || prompt.intent.trim();
  return {
    summary: `Deterministic Researcher baseline for: ${outcome}`,
    requirements: [
      outcome,
      "Keep changes minimal and confined to the affected surface",
      "Preserve existing behavior of unrelated files",
    ],
    dependencies: [],
    plan_steps: [
      {
        description: outcome,
        responsibility: "Implementation",
        requirement_indexes: [0, 1, 2],
      },
      {
        description: "Verify the requested behavior and preservation constraints",
        responsibility: "Verification",
        requirement_indexes: [0, 1, 2],
      },
    ],
    success_meaning: `The requested outcome is implemented and verified without unrelated changes: ${outcome}`,
    success_criteria: [
      {
        statement: `Implement: ${outcome}`,
        measurement: "Inspect the changed surface and execute its relevant validation/tests",
        expected_result: "Requested behavior is present and validation passes",
        requirement_indexes: [0],
      },
      {
        statement: "Keep the change scoped and preserve unrelated behavior",
        measurement: "Inspect the resulting change set and regression validation",
        expected_result: "No unrelated files or behaviors are changed",
        requirement_indexes: [1, 2],
      },
    ],
  };
}

export const RESEARCH_DRAFT_SHAPE = {
  summary: "string",
  requirements: ["string"],
  dependencies: [{ description: "string", required_by: [0] }],
  plan_steps: [
    {
      description: "string",
      responsibility: "string",
      requirement_indexes: [0],
    },
  ],
  success_meaning: "string",
  success_criteria: [
    {
      statement: "string",
      measurement: "string",
      expected_result: "string",
      requirement_indexes: [0],
    },
  ],
};
