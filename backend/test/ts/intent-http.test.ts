import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { harness } from "./harness.js";
import { startHttpServer } from "../../server/http-server.js";
import { ConversationStore } from "../../intent/conversation-store.js";
import { IntentCollectionService } from "../../intent/intent-collection.js";

test("Chat intent help path revises same Intent then runs canonical Task-managed chain", async () => {
  const root = resolve(`data/test-conversation-http/${process.pid}`);
  await rm(root, { recursive: true, force: true });
  const h = await harness("intent-http");
  const intent = new IntentCollectionService(new ConversationStore(root));
  const server = await startHttpServer(
    h.runtime,
    h.runs,
    h.events,
    resolve("web/dist"),
    0,
    h.task,
    intent,
  );
  try {
    const a = server.address();
    assert.ok(a && typeof a === "object");
    const base = `http://127.0.0.1:${a.port}`;
    const c = (await fetch(`${base}/api/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "I want to build something" }),
    }).then((r) => r.json())) as any;
    assert.equal(c.intent.ready_for_prompt, false);

    const p1 = await fetch(
      `${base}/api/conversations/${encodeURIComponent(c.conversation_id)}/prompt`,
      { method: "POST" },
    );
    assert.equal(p1.status, 409);
    const need = (await p1.json()) as any;
    assert.equal(need.result, "ROOT_CAUSE");
    assert.equal(need.help_request.source_processor, "IntentCollection");

    const c2 = (await fetch(
      `${base}/api/conversations/${encodeURIComponent(c.conversation_id)}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message:
            "Build a multimedia player that supports audio, video, and images.",
        }),
      },
    ).then((r) => r.json())) as any;
    assert.equal(c2.intent.intent_id, c.intent.intent_id);
    assert.equal(c2.intent.revision, 2);
    assert.equal(c2.intent.ready_for_prompt, true);

    const graph = (await fetch(
      `${base}/api/conversations/${encodeURIComponent(c.conversation_id)}/graph`,
    ).then((r) => r.json())) as any;
    assert.equal(
      graph.nodes.find((n: any) => n.id === "prompt").state,
      "COMPLETE",
    );

    const start = (await fetch(
      `${base}/api/conversations/${encodeURIComponent(c.conversation_id)}/run`,
      { method: "POST" },
    ).then((r) => r.json())) as any;
    assert.ok(start.run_id);
    assert.equal(start.intent_id, c.intent.intent_id);
    let snap: any;
    for (let i = 0; i < 120; i++) {
      snap = await fetch(`${base}/api/runs/${start.run_id}`).then((r) =>
        r.json(),
      );
      if (snap.result) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(snap.result, "PASSED");

    const task = (await fetch(`${base}/api/runs/${start.run_id}/task`).then(
      (r) => r.json(),
    )) as any;
    assert.equal(task.checkpoint.last_processor, "Done");
    const authority = (await fetch(
      `${base}/api/runs/${start.run_id}/authority-graph`,
    ).then((r) => r.json())) as any;
    assert.equal(authority.traceability.valid, true);
    assert.equal(
      authority.nodes.find((n: any) => n.id === "Researcher").state,
      "COMPLETE",
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((ok, fail) =>
      server.close((e) => (e ? fail(e) : ok())),
    );
    h.bridge.close();
  }
});
