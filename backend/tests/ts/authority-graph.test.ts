import test from "node:test";
import assert from "node:assert/strict";
import { projectAuthorityGraph } from "../../graph/authority-graph.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";

test("authority trace resolves owner responsibility skill tool capability and artifacts", () => {
  const bus = new ProcessingEventBus();
  bus.emit("a1", "Researcher", "Running");
  bus.emit("a1", "Integration:model", "Running", { scope: "SUPPORT" });
  bus.emit("a1", "Integration:model", "Completed", {
    scope: "SUPPORT",
    artifact_id: "draft:1",
  });
  bus.emit("a1", "Researcher", "Completed", {
    test_result: "Passed",
    artifact_id: "researcher:1",
  });

  const g = projectAuthorityGraph(bus.list("a1"));
  assert.equal(g.traceability.valid, true);
  const r = g.nodes.find((n) => n.id === "Researcher");
  assert.equal(r?.authority, "Researcher");
  assert.equal(r?.skill, "researcher");
  assert.equal(r?.tool, "evidence-collector");
  assert.equal(r?.artifact_id, "researcher:1");
  const a = g.nodes.find((n) => n.id === "Integration:model");
  assert.equal(a?.capability, "AI SDK Integration Model");
  assert.equal(a?.artifact_id, "draft:1");
});
