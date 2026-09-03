import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { resolveResearchProvider } from "../backend/role/researcher/provider-resolver.js";
import { harness } from "./harness.js";
import { startHttpServer } from "../backend/server/http-server.js";

test("HTTP/UI path reaches DONE through canonical ADK workflow and Researcher provider", async () => {
  const saved = {
    mode: process.env.ONESHOT_MODE,
    provider: process.env.ONESHOT_RESEARCH_PROVIDER,
    draft: process.env.ONESHOT_ADK_TEST_DRAFT_FILE,
  };
  process.env.ONESHOT_MODE = "production";
  process.env.ONESHOT_RESEARCH_PROVIDER = "adk_gemma2";
  process.env.ONESHOT_ADK_TEST_DRAFT_FILE =
    "app/fixtures/provider/adk-research-draft.json";
  const provider = await resolveResearchProvider(process.cwd());
  const h = await harness("adk-http", provider);
  const server = await startHttpServer(
    h.runtime,
    h.runs,
    h.events,
    resolve("ui"),
    0,
    h.task,
  );
  try {
    const a = server.address();
    assert.ok(a && typeof a === "object");
    const base = `http://127.0.0.1:${a.port}`;
    const start = (await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Build a compact media utility",
        requested_outcome: "Produce a validated implementation plan",
      }),
    }).then((r) => r.json())) as { run_id: string };

    let snap: any;
    for (let i = 0; i < 120; i += 1) {
      snap = await fetch(`${base}/api/runs/${start.run_id}`).then((r) =>
        r.json(),
      );
      if (snap.result) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    assert.equal(snap.result, "PASSED");
    assert.equal(snap.hash_proof.equal, true);
    const researcher = await h.store.load<any>(start.run_id, "researcher");
    assert.match(researcher.evidence[0].source, /google-adk:gemma2:9b/);
    assert.equal(
      snap.events.find(
        (e: any) => e.processor === "Builder" && e.state === "COMPLETE",
      )?.result,
      "PASSED",
    );
    assert.equal(
      snap.events.find(
        (e: any) => e.processor === "Done" && e.state === "COMPLETE",
      )?.result,
      "PASSED",
    );

    const graph = (await fetch(
      `${base}/api/runs/${start.run_id}/adk-graph`,
    ).then((r) => r.json())) as any;
    assert.equal(graph.graph_id, "oneshot-adk-workflow-v2");
    assert.equal(graph.authority, "projection-only");
    assert.equal(graph.execution_authority, "@google/adk");
    assert.equal(graph.root_agent.type, "SequentialAgent");
    assert.equal(graph.workflow_agents.gap_analysis, "LoopAgent");
    assert.equal(graph.workflow_agents.triple_validation, "ParallelAgent");
    assert.equal(graph.provider_subgraph.attached_to, "ResearcherStage");
    assert.equal(
      graph.nodes.find((n: any) => n.id === "Provider:cache")?.state,
      "COMPLETE",
    );
    assert.equal(
      graph.nodes.find((n: any) => n.id === "Provider:research-draft")?.state,
      "COMPLETE",
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((ok, fail) =>
      server.close((e) => (e ? fail(e) : ok())),
    );
    provider.close?.();
    h.close();
    for (const [k, v] of Object.entries(saved)) {
      const name =
        k === "mode"
          ? "ONESHOT_MODE"
          : k === "provider"
            ? "ONESHOT_RESEARCH_PROVIDER"
            : "ONESHOT_ADK_TEST_DRAFT_FILE";
      if (v === undefined) delete process.env[name];
      else process.env[name] = v;
    }
  }
});
