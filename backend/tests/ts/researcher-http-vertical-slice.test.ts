import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { RunRepository } from "../../runtime/run-repository.js";
import { FileArtifactStore } from "../../runtime/artifact-store.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";
import { DEFAULT_ROUTING_POLICY } from "../../integration/core/policy.js";
import type { ResolvedExecutionRoute } from "../../integration/core/route.js";
import type { Router, RouteRequest, RouteResult } from "../../integration/routing/router.js";
import type { ResearcherWorkflow } from "../../agents/researcher/workflow.js";
import type { ResearchBundle } from "../../contracts/schema/types.js";
import {
  handleResearcherRoutes,
  type ResearcherHandlerContext,
} from "../../server/researcher-handlers.js";
import { FakeRuntime } from "../../integration/runtime/fake-runtime.js";

class MockRes {
  status = 0;
  body: any = {};
  writeHead(status: number) { this.status = status; }
  end(data: string) { this.body = JSON.parse(data); }
}

function mockRoute(runId: string): ResolvedExecutionRoute {
  return {
    routeId: `route:test:${runId}`, workflowId: "researcher",
    policy: DEFAULT_ROUTING_POLICY, runtimeId: "fake-runtime",
    providerId: "ollama", endpointId: "ep-ollama",
    baseUrl: "http://localhost:11434/v1", modelId: "llama3",
    transport: "openai-chat", locality: "loopback",
    capabilities: [
      { capability: "tool-use", state: "verified", source: "probe" },
      { capability: "structured-output", state: "verified", source: "probe" },
    ],
    researchMode: "disabled", routeReason: "M13 test route",
    rejectedCandidates: [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

function mockRouter(runId: string): Router {
  const route = mockRoute(runId);
  return {
    route(_req: RouteRequest): RouteResult {
      return { route, considered: 3, rejected: [{ providerId: "openai", stage: "privacy", reason: "cloud not allowed" }] };
    },
  };
}

function mockResearcher(): ResearcherWorkflow {
  const bundle: ResearchBundle = {
    prompt: { prompt_id: "prompt:test", intent: "test", requested_outcome: "test", context: [], research_direction: [] },
    researcher: {
      researcher_id: "researcher:test", prompt_id: "prompt:test",
      plan_id: "plan:test", schema_id: "schema:test", fixture_id: "fixture:test",
      goal_id: "goal:test", validation_id: "validation:test",
      evidence: [{ source: "test", statement: "test evidence", provenance: "user-prompt" }],
      stage: "Researcher", status: "Completed",
    },
    plan: { plan_id: "plan:test", steps: [{ description: "test", responsibility: "test", requirement_indexes: [0] }], revision: 1 },
    schema_artifact: { schema_id: "schema:test", fields: [] },
    fixture: { fixture_id: "fixture:test", assertions: [] },
    goal: { goal_id: "goal:test", criteria: [] },
    validation: { validation_id: "validation:test", result: "Passed", assertion_results: [], criterion_results: [] },
  } as unknown as ResearchBundle;
  return { runWithRuntime: async () => bundle } as unknown as ResearcherWorkflow;
}

async function createContext(dir: string) {
  const runs = new RunRepository(dir);
  const store = new FileArtifactStore(dir);
  const events = new ProcessingEventBus();
  const fake = new FakeRuntime();
  const ctx: ResearcherHandlerContext = {
    runs, store, events, researcher: mockResearcher(),
    router: mockRouter("test"), routingPolicy: DEFAULT_ROUTING_POLICY,
    runtimeResolver: (id) => (id === "fake-runtime" ? fake : undefined),
  };
  return { ctx, cleanup: async () => { try { await rm(dir, { recursive: true, force: true }); } catch (_e) {} } };
}

test("M13: valid POST /api/researcher/run returns wait-human with route snapshot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m13-valid-"));
  const { ctx, cleanup } = await createContext(dir);
  try {
    const res = new MockRes();
    await handleResearcherRoutes({ method: "POST" } as any, res as any,
      new URL("http://localhost/api/researcher/run"),
      { intent: "test intent", requested_outcome: "test outcome" }, ctx);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "wait-human");
    assert.ok(res.body.run_id);
    assert.ok(res.body.route_snapshot);
    assert.equal(res.body.route_snapshot.providerId, "ollama");
    assert.ok(res.body.evidence_count > 0);
  } finally { await cleanup(); }
});

test("M13: invalid POST /api/researcher/run (missing intent) returns 400", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m13-invalid-"));
  const { ctx, cleanup } = await createContext(dir);
  try {
    const res = new MockRes();
    await handleResearcherRoutes({ method: "POST" } as any, res as any,
      new URL("http://localhost/api/researcher/run"),
      { requested_outcome: "test" }, ctx);
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  } finally { await cleanup(); }
});

test("M13: POST /api/runs/:runId/review (approved) finalizes run as Done/Passed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m13-rev-"));
  const { ctx, cleanup } = await createContext(dir);
  try {
    const res1 = new MockRes();
    await handleResearcherRoutes({ method: "POST" } as any, res1 as any,
      new URL("http://localhost/api/researcher/run"),
      { intent: "test", requested_outcome: "test" }, ctx);
    const runId = res1.body.run_id;
    assert.ok(ctx.runs.get(runId)?.route_snapshot, "route_snapshot must be on the run");
    const res2 = new MockRes();
    await handleResearcherRoutes({ method: "POST" } as any, res2 as any,
      new URL(`http://localhost/api/runs/${runId}/review`),
      { decision: "approved" }, ctx);
    assert.equal(res2.status, 200);
    assert.equal(res2.body.status, "approved");
    assert.equal(res2.body.pipeline_status, "Done");
    assert.equal(res2.body.test_result, "Passed");
    assert.ok(res2.body.route_snapshot, "route_snapshot returned in review");
  } finally { await cleanup(); }
});

test("M13: POST /api/runs/:runId/review (rejected) finalizes run as Done/Failed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m13-rej-"));
  const { ctx, cleanup } = await createContext(dir);
  try {
    const res1 = new MockRes();
    await handleResearcherRoutes({ method: "POST" } as any, res1 as any,
      new URL("http://localhost/api/researcher/run"),
      { intent: "test", requested_outcome: "test" }, ctx);
    const runId = res1.body.run_id;
    const res2 = new MockRes();
    await handleResearcherRoutes({ method: "POST" } as any, res2 as any,
      new URL(`http://localhost/api/runs/${runId}/review`),
      { decision: "rejected", feedback: "insufficient evidence" }, ctx);
    assert.equal(res2.status, 200);
    assert.equal(res2.body.status, "rejected");
    assert.equal(res2.body.pipeline_status, "Done");
    assert.equal(res2.body.test_result, "Failed");
  } finally { await cleanup(); }
});

test("M13: POST /api/runs/:runId/review with invalid decision returns 400", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m13-badrev-"));
  const { ctx, cleanup } = await createContext(dir);
  try {
    const res1 = new MockRes();
    await handleResearcherRoutes({ method: "POST" } as any, res1 as any,
      new URL("http://localhost/api/researcher/run"),
      { intent: "test", requested_outcome: "test" }, ctx);
    const runId = res1.body.run_id;
    const res2 = new MockRes();
    await handleResearcherRoutes({ method: "POST" } as any, res2 as any,
      new URL(`http://localhost/api/runs/${runId}/review`),
      { decision: "maybe" }, ctx);
    assert.equal(res2.status, 400);
  } finally { await cleanup(); }
});

test("M13: POST /api/runs/:runId/review for non-existent run falls through (not handled by researcher)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m13-404-"));
  const { ctx, cleanup } = await createContext(dir);
  try {
    const res = new MockRes();
    const handled = await handleResearcherRoutes({ method: "POST" } as any, res as any,
      new URL("http://localhost/api/runs/nonexistent-run/review"),
      { decision: "approved" }, ctx);
    // Non-existent runs have no route_snapshot, so the researcher dispatcher
    // correctly returns false and lets the existing plan-review handler take over.
    assert.equal(handled, false);
  } finally { await cleanup(); }
});

test("M13: researcher routes without context return 501", async () => {
  const res = new MockRes();
  await handleResearcherRoutes({ method: "POST" } as any, res as any,
    new URL("http://localhost/api/researcher/run"), {}, undefined);
  assert.equal(res.status, 501);
});

test("M13: route snapshot has no credential fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m13-nosec-"));
  const { ctx, cleanup } = await createContext(dir);
  try {
    const res = new MockRes();
    await handleResearcherRoutes({ method: "POST" } as any, res as any,
      new URL("http://localhost/api/researcher/run"),
      { intent: "test", requested_outcome: "test" }, ctx);
    const snapshot = JSON.stringify(res.body.route_snapshot);
    assert.ok(!snapshot.includes("apiKey"), "no apiKey in snapshot");
    assert.ok(!snapshot.includes("credentialId"), "no credentialId in snapshot");
    assert.ok(!snapshot.includes("secret"), "no secret in snapshot");
  } finally { await cleanup(); }
});

test("M13: GET /api/providers returns provider list", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m13-prov-"));
  const { ctx, cleanup } = await createContext(dir);
  try {
    const res = new MockRes();
    await handleResearcherRoutes({ method: "GET" } as any, res as any,
      new URL("http://localhost/api/providers"), {}, ctx);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.providers));
    assert.ok(res.body.providers.some((p: any) => p.id === "ollama"));
  } finally { await cleanup(); }
});

test("M13: GET /api/providers returns provider list", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m13-prov-"));
  const { ctx, cleanup } = await createContext(dir);
  try {
    const res = new MockRes();
    await handleResearcherRoutes({ method: "GET" } as any, res as any,
      new URL("http://localhost/api/providers"), {}, ctx);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.providers));
    assert.ok(res.body.providers.some((p: any) => p.id === "ollama"));
  } finally { await cleanup(); }
});
