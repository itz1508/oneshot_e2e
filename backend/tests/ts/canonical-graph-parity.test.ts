import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface GraphEdge {
  from: string;
  to: string;
  artifact: string;
}

interface WorkflowAgent {
  id: string;
  type: string;
  members: string[];
  exit?: string;
  join?: string;
}

test("machine-readable graph records LoopAgent ParallelAgent Builder and H1/H2 path", async () => {
  const graph = JSON.parse(
    await readFile(resolve("backend/workflow/graph.json"), "utf8"),
  ) as {
    version: string;
    edges: GraphEdge[];
    workflow_agents: WorkflowAgent[];
  };

  assert.equal(graph.version, "2");

  const agents = new Map(
    graph.workflow_agents.map((agent) => [agent.id, agent]),
  );
  assert.equal(agents.get("OneShotCanonicalWorkflow")?.type, "SequentialAgent");
  assert.equal(agents.get("GapAnalysisLoop")?.type, "LoopAgent");
  assert.deepEqual(agents.get("GapAnalysisLoop")?.members, [
    "GapCheck",
    "GapFix",
    "GapRecheck",
  ]);
  assert.equal(agents.get("GapAnalysisLoop")?.exit, "GapAnalysisComplete");
  assert.equal(
    agents.get("TripleValidationParallel")?.type,
    "ParallelAgent",
  );
  assert.deepEqual(agents.get("TripleValidationParallel")?.members, [
    "SchemaValidation",
    "FixtureValidation",
    "GoalValidation",
  ]);
  assert.equal(
    agents.get("TripleValidationParallel")?.join,
    "TripleValidation",
  );

  const edges = new Set(
    graph.edges.map((edge) => `${edge.from}|${edge.to}|${edge.artifact}`),
  );
  for (const required of [
    "GapRecheck|GapCheck|gaps_remaining",
    "Confirmed|Builder|confirmed_package",
    "CreateHash|Builder|HASH",
    "Builder|Hash|hash_sandbox",
    "Builder|Hash|build_result",
    "Hash|Done|verified_HASH",
  ]) {
    assert.ok(edges.has(required), `missing graph edge ${required}`);
  }
});
