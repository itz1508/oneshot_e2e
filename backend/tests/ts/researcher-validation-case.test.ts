import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import { harness } from "./harness.js";
import { ResearcherWorkflow } from "../../agents/researcher/workflow.js";
import type { StructuredResearchDraft } from "../../agents/researcher/structured-draft.js";

interface ValidationCaseAssertion {
  id: string;
  operator: string;
  actual?: string;
  expected?: unknown;
  from?: string;
  to?: string;
}

interface ValidationCase {
  id: string;
  fixtureId: string;
  name: string;
  assertions: ValidationCaseAssertion[];
}

interface PlanAssertion {
  id: string;
  kind: string;
  subjectId: string;
  expectedPlannerReview: string;
  expectedRoute: string;
  expectedAdmission: string;
  evidenceSourceIds: string[];
}

interface FixtureDefinition {
  id: string;
  goalIds: string[];
  inputRefs: string[];
  planAssertions: PlanAssertion[];
}

function resolvePath(root: any, path: string): any {
  if (!path || path === "$" || path === "researchBundle") return root;
  let p = path.startsWith("$.") ? path.slice(2) : path;
  if (p.startsWith("researchBundle.")) p = p.slice("researchBundle.".length);
  let cur = root;
  for (const part of p.split(".")) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function resolveExpected(expected: unknown, fixture: FixtureDefinition): unknown {
  if (typeof expected === "string" && expected.startsWith("fixture.inputRefs[") && expected.endsWith("]")) {
    const key = expected.slice("fixture.inputRefs[".length, -1);
    const found = fixture.inputRefs.find((ref) => ref === key || ref.includes(key));
    return found || key;
  }
  return expected;
}

test("Researcher provider capability vertical slice: FIXED VALIDATION CASE & FIXTURE", async () => {
  // Load fixed validation case and fixture
  const validationCase = JSON.parse(
    await readFile(resolve("app/fixtures/research/validation-case-researcher-provider-tavily-001.json"), "utf8"),
  ) as ValidationCase;

  const fixture = JSON.parse(
    await readFile(resolve("app/fixtures/research/fixture-researcher-provider-tavily-001.json"), "utf8"),
  ) as FixtureDefinition;

  assert.equal(validationCase.id, "validation-case:researcher:provider-tavily:001");
  assert.equal(fixture.id, "fixture:researcher:provider-tavily:001");

  const h = await harness("researcher-validation-case");

  try {
    const runId = "provider-tavily-001";
    const promptId = "prompt:researcher-provider-discovery";

    const prompt: Prompt = {
      prompt_id: promptId,
      intent: "Discover provider capabilities and search technical docs",
      requested_outcome: "Researcher provider capability vertical slice",
      context: [
        {
          context_id: "ctx:provider-discovery",
          statement: "integration:tavily search and integration:strands agent integration",
        },
      ],
      research_direction: [
        "prompt:researcher-provider-discovery",
        "integration:tavily",
        "integration:strands",
        "workflow:researcher",
      ],
    };

    // Capability providing structured research draft with resolved dependencies
    const sampleDraft: StructuredResearchDraft = {
      summary: "Researcher integration vertical slice with Strands and Tavily capabilities.",
      requirements: [
        "Preserve canonical workflow traceability across provider capability discovery",
        "Support Tavily search and extract via Strands agent function tool",
      ],
      dependencies: [
        { description: "integration:tavily", required_by: [0] },
        { description: "integration:strands", required_by: [0] },
      ],
      plan_steps: [
        {
          description: "Initialize Strands Agent with Tavily research tool capability",
          responsibility: "ResearcherIntegration",
          requirement_indexes: [0, 1],
        },
      ],
      success_meaning: "Provider and Tavily capabilities validated through canonical schemas.",
      success_criteria: [
        {
          statement: "ResearchBundle satisfies schema and passes human review gate",
          measurement: "All canonical schemas valid and edge to ResearchReview present",
          expected_result: "PASSED",
          requirement_indexes: [0],
        },
      ],
    };

    const researcher = new ResearcherWorkflow(h.contracts, async () => sampleDraft);
    const researchBundle: ResearchBundle = await researcher.run(prompt, runId);

    // 1. Evaluate all 8 assertions of validation-case:researcher:provider-tavily:001
    const graph = JSON.parse(await readFile(resolve("backend/workflow/graph.json"), "utf8"));

    const assertionResults: Array<{ id: string; satisfied: boolean; detail?: any }> = [];

    for (const assertion of validationCase.assertions) {
      const expected = resolveExpected(assertion.expected, fixture);
      let satisfied = false;
      let actualValue: any;

      if (assertion.operator === "matchesSchema") {
        actualValue = resolvePath(researchBundle, assertion.actual || "");
        await h.contracts.validate(expected as string, actualValue);
        satisfied = true;
      } else if (assertion.operator === "references") {
        actualValue = resolvePath(researchBundle, assertion.actual || "");
        if (Array.isArray(actualValue)) {
          satisfied = actualValue.some((item: any) => {
            if (typeof item === "string") return item === expected;
            if (item && typeof item === "object") {
              return item.source === expected || item.provenance === expected || item.statement?.includes(expected as string);
            }
            return false;
          });
        } else {
          satisfied = actualValue === expected;
        }
      } else if (assertion.operator === "exists") {
        actualValue = resolvePath(researchBundle, assertion.actual || "");
        satisfied = actualValue !== undefined && actualValue !== null && actualValue !== "";
        if (Array.isArray(actualValue)) satisfied = satisfied && actualValue.length > 0;
      } else if (assertion.operator === "edgeExists") {
        const fromNode = assertion.from;
        const toNode = assertion.to;
        const edges = graph.edges || [];
        satisfied = edges.some((e: any) => e.from === fromNode && e.to === toNode);
        actualValue = satisfied;
      }

      assertionResults.push({ id: assertion.id, satisfied, detail: { actual: actualValue, expected } });
      assert.ok(satisfied, `Validation case assertion failed: ${assertion.id}`);
    }

    assert.equal(assertionResults.length, 8);
    assert.ok(assertionResults.every((a) => a.satisfied));

    // 2. Evaluate all 4 plan assertions of fixture:researcher:provider-tavily:001
    const planAssertionResults: Array<{ id: string; satisfied: boolean }> = [];

    for (const pa of fixture.planAssertions) {
      let satisfied = true;

      // Verify evidenceSourceIds
      const evidenceSources = new Set(researchBundle.researcher.evidence.map((e) => e.source));
      for (const esid of pa.evidenceSourceIds) {
        if (!evidenceSources.has(esid) && !researchBundle.researcher.evidence.some((e) => e.source.includes(esid))) {
          satisfied = false;
        }
      }

      if (pa.kind === "REQUIRED_RECORD_PRESENT") {
        if (pa.subjectId === "researchBundle") {
          satisfied = satisfied && !!researchBundle.researcher && !!researchBundle.plan;
        } else {
          satisfied = satisfied && (pa.subjectId in researchBundle);
        }
      } else if (pa.kind === "DEPENDENCY_RESOLVED") {
        const hasDep = researchBundle.plan.dependencies.some(
          (d) => d.description === pa.subjectId || d.dependency_id === pa.subjectId || evidenceSources.has(pa.subjectId),
        );
        satisfied = satisfied && hasDep;
      } else if (pa.kind === "ROUTE_EXPECTED") {
        const edges = graph.edges || [];
        const hasRoute = edges.some(
          (e: any) => (e.from === "Researcher" || e.from === "Researcher.completedResult") && (e.to === "ResearchReview" || e.to === "ResearchReview.input"),
        );
        satisfied = satisfied && hasRoute;
      }

      planAssertionResults.push({ id: pa.id, satisfied });
      assert.ok(satisfied, `Plan assertion failed: ${pa.id}`);
    }

    assert.equal(planAssertionResults.length, 4);
    assert.ok(planAssertionResults.every((pa) => pa.satisfied));

    // 3. Evaluate via the canonical contracts Skill run_fixture tool
    const pyValCaseResult = await h.contracts.invoke<{ results: any[]; valid: boolean }>("run_fixture", {
      fixture: { plan_assertions: validationCase.assertions },
      plan: researchBundle,
    });
    assert.equal(pyValCaseResult.valid, true, "Python canonical run_fixture tool satisfied validation case assertions");

    const pyFixtureResult = await h.contracts.invoke<{ results: any[]; valid: boolean }>("run_fixture", {
      fixture,
      plan: researchBundle,
    });
    assert.equal(pyFixtureResult.valid, true, "Python canonical run_fixture tool satisfied fixture plan assertions");
  } finally {
    h.bridge.close();
  }
});
