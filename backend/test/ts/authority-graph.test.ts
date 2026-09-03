import test from "node:test";
import assert from "node:assert/strict";
import { projectAuthorityGraph } from "../../graph/authority-graph.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";

test("authority trace resolves owner responsibility skill tool capability and artifacts", () => {
  const bus = new ProcessingEventBus();
  bus.emit("a1", "Researcher", "RUNNING");
  bus.emit("a1", "ADK:researcher-provider", "RUNNING", { scope: "ADK" });
  bus.emit("a1", "ADK:researcher-provider", "COMPLETE", {
    scope: "ADK",
    artifact_id: "draft:1",
  });
  bus.emit("a1", "Researcher", "COMPLETE", {
    result: "PASSED",
    artifact_id: "researcher:1",
  });

  const g = projectAuthorityGraph(bus.list("a1"));
  assert.equal(g.traceability.valid, true);
  const r = g.nodes.find((n) => n.id === "Researcher");
  assert.equal(r?.authority, "Researcher");
  assert.equal(r?.skill, "researcher");
  assert.equal(r?.tool, "evidence-collector");
  assert.equal(r?.artifact_id, "researcher:1");
  const a = g.nodes.find((n) => n.id === "ADK:researcher-provider");
  assert.equal(a?.capability, "Google ADK");
  assert.equal(a?.artifact_id, "draft:1");
});
