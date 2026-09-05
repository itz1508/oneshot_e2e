import type { ProcessingEvent } from "../../contracts/schema/types.js";

/**
 * Canonical processor ordering.
 * TripleValidation is now an explicit node between the three validators and
 * Confirmed.
 */
export const CANONICAL_PROCESSORS: string[] = [
  "Researcher",
  "Planner",
  "Refactor",
  "GapAnalysis",
  "Evaluation",
  "SchemaValidation",
  "FixtureValidation",
  "GoalValidation",
  "TripleValidation",
  "Confirmed",
  "CreateHash",
  "Builder",
  "Hash",
  "Done",
] as const;

const index = new Map(CANONICAL_PROCESSORS.map((x, i) => [x, i]));

export interface OrderingIssue {
  sequence: number;
  processor: string;
  issue: string;
}

/**
 * Detect ordering violations in a completed event stream.
 * Only inspects WORKFLOW-scope COMPLETE events.
 */
export function detectOrderingIssues(
  events: ProcessingEvent[],
): OrderingIssue[] {
  const issues: OrderingIssue[] = [];
  const completed = new Set<string>();

  for (const e of events.filter(
    (x) => x.scope === "WORKFLOW" && x.state === "COMPLETE",
  )) {
    // Duplicate completion check
    if (completed.has(e.processor)) {
      issues.push({
        sequence: e.sequence,
        processor: e.processor,
        issue: "duplicate completion",
      });
    }

    const i = index.get(e.processor);
    if (i === undefined) {
      issues.push({
        sequence: e.sequence,
        processor: e.processor,
        issue: "unknown canonical processor",
      });
      continue;
    }

    // Early ROOT_CAUSE from Done is always valid (short-circuit exit)
    if (e.processor === "Done" && e.result === "ROOT_CAUSE") {
      completed.add(e.processor);
      continue;
    }

    if (i > 0) {
      if (
        ["SchemaValidation", "FixtureValidation", "GoalValidation"].includes(
          e.processor,
        )
      ) {
        // Validators must complete after Evaluation
        if (!completed.has("Evaluation")) {
          issues.push({
            sequence: e.sequence,
            processor: e.processor,
            issue: "validator completed before Evaluation",
          });
        }
      } else if (e.processor === "TripleValidation") {
        // Triple must complete after all three validators
        for (const v of [
          "SchemaValidation",
          "FixtureValidation",
          "GoalValidation",
        ]) {
          if (!completed.has(v)) {
            issues.push({
              sequence: e.sequence,
              processor: e.processor,
              issue: `TripleValidation completed before ${v}`,
            });
          }
        }
      } else if (e.processor === "Confirmed") {
        if (!completed.has("TripleValidation")) {
          issues.push({
            sequence: e.sequence,
            processor: e.processor,
            issue: "Confirmed completed before TripleValidation",
          });
        }
      } else {
        // Linear predecessor check
        const prev = CANONICAL_PROCESSORS[i - 1];
        if (!completed.has(prev)) {
          issues.push({
            sequence: e.sequence,
            processor: e.processor,
            issue: `completed before ${prev}`,
          });
        }
      }
    }

    completed.add(e.processor);
  }

  return issues;
}
