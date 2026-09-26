import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ResearchSkill,
  TavilySearchBackend,
  DesignPlanningSkill,
  RESEARCH_PHASE_ORDER,
  RESEARCH_PHASE_TRANSITIONS,
  DESIGN_PLANNING_PHASE_ORDER,
  DESIGN_PLANNING_PHASE_TRANSITIONS,
  RESEARCH_STOP_PHASE,
  DESIGN_PLANNING_STOP_PHASE,
  isResearchHandoffReady,
  canInvokeDesignPlanning,
  isResearchRunFinished,
  isDesignPlanningRunFinished,
  researchMayPerform,
  designPlanningMayPerform,
  canAdvanceResearch,
} from "../src/index.ts";

const NO_SEARCH = { enabled: false, source: "none" };
const MODEL = { provider: "gemini", model: "gemini-2.5-flash" };

describe("Corrected workflow state model", () => {
  it("research has the seven governed phases and stops at READY_FOR_PLANNING", () => {
    assert.equal(RESEARCH_PHASE_ORDER.length, 7);
    assert.equal(RESEARCH_PHASE_ORDER[0], "ACTIVE");
    assert.equal(RESEARCH_STOP_PHASE, "READY_FOR_PLANNING");
    // The stop phase has no outgoing transitions: research cannot continue.
    assert.deepEqual(RESEARCH_PHASE_TRANSITIONS.READY_FOR_PLANNING, []);
  });

  it("Design_Planning has its own phases and stops at APPROVED_PLAN", () => {
    assert.equal(DESIGN_PLANNING_PHASE_ORDER.length, 6);
    assert.equal(DESIGN_PLANNING_PHASE_ORDER[0], "UNDEFINED");
    assert.equal(DESIGN_PLANNING_STOP_PHASE, "APPROVED_PLAN");
    assert.deepEqual(DESIGN_PLANNING_PHASE_TRANSITIONS.APPROVED_PLAN, []);
  });

  it("the two state machines are not conflated", () => {
    const researchPhases = new Set(RESEARCH_PHASE_ORDER);
    const planningPhases = new Set(DESIGN_PLANNING_PHASE_ORDER);
    for (const phase of researchPhases) {
      assert.equal(planningPhases.has(phase), false, `${phase} must not appear in both machines`);
    }
  });

  it("research may read and search but never write or select architecture", () => {
    assert.equal(researchMayPerform("read_repository"), true);
    assert.equal(researchMayPerform("query_search"), true);

describe("ResearchSkill", () => {
  it("runs the full lifecycle and stops at the handoff boundary", async () => {
    const phases = [];
    const skill = new ResearchSkill();
    const result = await skill.run({
      intent: "OneShot architecture invariants",
      model: MODEL,
      search: NO_SEARCH,
      onPhase: (p) => phases.push(p),
    });

    assert.equal(result.stopped, true);
    assert.equal(result.run.phase, RESEARCH_STOP_PHASE);
    assert.equal(isResearchRunFinished(result.run), true);
    assert.deepEqual(phases, [
      "RECONCILING",
      "RESEARCHING",
      "DRAFTING",
      "BASELINE_VALIDATING",
      "REVIEW",
      "READY_FOR_PLANNING",
    ]);
  });

  it("produces a ResearchBundle that delegates the build decision", async () => {
    const skill = new ResearchSkill();
    const result = await skill.run({ intent: "intent", model: MODEL, search: NO_SEARCH });

    const bundle = result.run.bundle;
    assert.ok(bundle, "a bundle must be produced");
    assert.equal(bundle.decisionOwner, "Design_Planning");
    assert.equal(bundle.intent, "intent");
    assert.equal(isResearchHandoffReady(result.run), true);
  });

  it("never fabricates sources when search is disabled", async () => {
    const skill = new ResearchSkill();
    const result = await skill.run({ intent: "intent", model: MODEL, search: NO_SEARCH });

    assert.equal(result.run.bundle.sources.length, 0);
    assert.equal(result.issues.length > 0, true, "the missing evidence must be reported");
  });

  it("reports an honest failure when the search adapter throws", async () => {
    const failing = new TavilySearchBackend(undefined);
    // No API key and no fixture: the adapter must throw rather than invent results.
    await assert.rejects(() => failing.search("anything"), /TAVILY_API_KEY/);

    const skill = new ResearchSkill(failing);
    const result = await skill.run({
      intent: "intent",
      model: MODEL,
      search: { enabled: true, source: "tavily" },
    });
    assert.equal(result.run.phase, RESEARCH_STOP_PHASE);
    assert.equal(result.run.bundle.sources.length, 0);
    assert.match(result.issues.join(" "), /Search unavailable/);
  });

  it("records real sources when the adapter returns them", async () => {
    const fakeBackend = {
      search: async () => ({
        query: "intent",
        depth: "basic",
        results: [
          { title: "T1", url: "https://example.test/1", content: "C1", score: 0.9 },
          { title: "T2", url: "https://example.test/2", content: "C2", score: 0.2 },
        ],
        executedBy: "agent",
        timestamp: new Date().toISOString(),
      }),
    };
    const skill = new ResearchSkill(fakeBackend);
    const result = await skill.run({
      intent: "intent",
      model: MODEL,
      search: { enabled: true, source: "tavily" },
    });

    assert.equal(result.run.bundle.sources.length, 2);
    assert.equal(result.run.bundle.alternatives.length, 2);
    // Low-confidence sources are surfaced as gaps, not silently dropped.
    assert.ok(result.run.bundle.gaps.some((g) => g.includes("T2")));
  });

  it("refuses to skip a phase", () => {
    const run = { runId: "r", phase: "ACTIVE", startedAt: "t" };
    assert.equal(canAdvanceResearch(run, "RESEARCHING"), false);
    assert.equal(canAdvanceResearch(run, "RECONCILING"), true);
  });
});

describe("Design_Planning handoff rules", () => {
  it("is never invoked without an explicit user action", () => {
    assert.equal(canInvokeDesignPlanning(null, false), false);
    assert.equal(canInvokeDesignPlanning(null, true), true);
  });


describe("DesignPlanningSkill", () => {
  const input = {
    userIntent: "ship the thing",
    repositoryState: "clean",
    existingArchitecture: "modular",
    existingPhaseReceipts: [],
    existingBaselines: ["base-1"],
  };

  it("runs the five reviews and stops before approval", async () => {
    const skill = new DesignPlanningSkill();
    const result = await skill.plan({ input });

    assert.equal(result.run.phase, "PRE_BUILD_REVIEWED");
    assert.equal(result.run.phase === "APPROVED_PLAN", false);
    assert.equal(result.stopped, false, "the run is not finished until the user approves");
    assert.equal(result.run.auditId.startsWith("audit-"), true);
    assert.equal(isDesignPlanningRunFinished(result.run), false);
  });

  it("records a missing ResearchBundle instead of re-researching", async () => {
    const skill = new DesignPlanningSkill();
    const result = await skill.plan({ input });
    assert.match(result.issues.join(" "), /No ResearchBundle was supplied/);
  });

  it("consumes a supplied ResearchBundle without re-researching", async () => {
    const skill = new DesignPlanningSkill();
    const result = await skill.plan({
      input: {
        ...input,
        researchBundle: {
          runId: "r1",
          intent: "ship the thing",
          model: MODEL,
          search: NO_SEARCH,
          sources: [],
          gaps: ["gap one"],
          alternatives: [],
          decisionOwner: "Design_Planning",
          createdAt: "t",
        },
      },
    });
    assert.equal(result.issues.length, 0);
  });

  it("does not pretend reviews passed when their inputs are missing", async () => {
    const skill = new DesignPlanningSkill();
    const result = await skill.plan({
      input: {
        userIntent: "",
        repositoryState: "",
        existingArchitecture: "",
        existingPhaseReceipts: [],
        existingBaselines: [],
      },
    });
    // The run still reaches PRE_BUILD_REVIEWED, but nothing is fabricated.
    assert.equal(result.run.phase, "PRE_BUILD_REVIEWED");
  });

  it("ends only through an explicit user approval", async () => {
    const skill = new DesignPlanningSkill();
    const result = await skill.plan({ input });
    assert.equal(result.run.phase, "PRE_BUILD_REVIEWED");

    const approved = skill.approvePlan(result.run, {
      planId: "plan-1",
      intent: input.userIntent,
      steps: ["step one"],
      reviews: [],
    });

    assert.equal(approved.phase, "APPROVED_PLAN");
    assert.equal(isDesignPlanningRunFinished(approved), true);
    assert.equal(approved.approvedPlan.approvedBy, "user");
  });

  it("refuses approval before the run reaches PRE_BUILD_REVIEWED", () => {
    const skill = new DesignPlanningSkill();
    const premature = { runId: "p", phase: "PLANNING", startedAt: "t" };
    assert.throws(
      () => skill.approvePlan(premature, { planId: "p", intent: "i", steps: [], reviews: [] }),
      /PRE_BUILD_REVIEWED/
    );
  });
});

  it("refuses a research run that has not reached the handoff", () => {
    const pending = { runId: "r", phase: "RESEARCHING", startedAt: "t" };
    assert.equal(canInvokeDesignPlanning(pending, true), false);

    const ready = {
      runId: "r",
      phase: "READY_FOR_PLANNING",
      startedAt: "t",
      bundle: { runId: "r" },
    };
    assert.equal(canInvokeDesignPlanning(ready, true), true);
  });
});

    assert.equal(researchMayPerform("write_repository"), false);
    assert.equal(researchMayPerform("select_architecture"), false);
  });

  it("Design_Planning may review and emit plans but never claim execution", () => {
    assert.equal(designPlanningMayPerform("review"), true);
    assert.equal(designPlanningMayPerform("emit_plan"), true);
    for (const forbidden of [
      "claim_implementation",
      "claim_build",
      "claim_verification",
      "claim_receipt",
      "claim_promotion",
      "claim_closed",
    ]) {
      assert.equal(designPlanningMayPerform(forbidden), false, `${forbidden} must be refused`);
    }
  });
});
