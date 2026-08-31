import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { AppendOnlyProcessingEventStore } from "../backend/task/event/event-store.js";
import { ProcessingEventBus } from "../backend/runtime/event-bus.js";
import { detectOrderingIssues } from "../backend/task/guard/ordering.js";
import { projectAdkGraph } from "../backend/graph/adk-graph.js";

test("Task event stream is append-only, replayable, traced, and ADK-projectable", async () => {
  const root = resolve(`data/test-task-store/${process.pid}`);
  await rm(root, { recursive: true, force: true });
  const store = new AppendOnlyProcessingEventStore(root),
    bus = new ProcessingEventBus(store);

  bus.emit("r1", "Researcher", "PENDING");
  bus.emit("r1", "Researcher", "RUNNING");
  bus.emit("r1", "ADK:cache", "RUNNING", { scope: "ADK", message: "lookup" });
  bus.emit("r1", "ADK:cache", "COMPLETE", { scope: "ADK", message: "hit" });
  bus.emit("r1", "Researcher", "COMPLETE", { result: "PASSED" });

  const reloaded = new AppendOnlyProcessingEventStore(root).list("r1");
  assert.equal(reloaded.length, 5);
  assert.deepEqual(
    reloaded.map((e) => e.sequence),
    [1, 2, 3, 4, 5],
  );
  assert.ok(
    reloaded.every(
      (e) =>
        e.event_id &&
        e.correlation_id === "run:r1" &&
        /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/.test(e.traceparent),
    ),
  );
  assert.equal(reloaded[1].causation_id, reloaded[0].event_id);
  assert.equal(detectOrderingIssues(reloaded).length, 0);
  const graph = projectAdkGraph(reloaded);
  assert.equal(
    graph.nodes.find((n) => n.id === "cache")?.state,
    "COMPLETE",
  );
});
