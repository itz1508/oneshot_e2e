import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Server } from "node:http";
import { startHttpServer } from "../../server/http-server.js";
import { IntentCollectionService } from "../../intent/intent-collection.js";
import { ConversationStore } from "../../intent/conversation-store.js";
import { RunRepository } from "../../runtime/run-repository.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";
import { AppendOnlyProcessingEventStore } from "../../task/event/event-store.js";
import { FileArtifactStore } from "../../runtime/artifact-store.js";
import { getSharedRedis } from "../../runtime/redis-connection.js";

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.();
  await new Promise<void>((ok, fail) =>
    server.close((error) => (error ? fail(error) : ok())),
  );
}

function baseUrl(server: Server): string {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

test("conversation message routing stores turns and rejects invalid runs", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "oneshot-conversation-routing-"));
  const conversationsDir = join(temporaryRoot, "conversations");
  const runStateDir = join(temporaryRoot, "runs");
  const taskEventsDir = join(temporaryRoot, "task-events");
  const artifactsDir = join(temporaryRoot, "artifacts");
  let server: Server | undefined;

  try {
    await mkdir(conversationsDir, { recursive: true });
    await mkdir(runStateDir, { recursive: true });
    await mkdir(taskEventsDir, { recursive: true });
    await mkdir(artifactsDir, { recursive: true });

    const intent = new IntentCollectionService(
      new ConversationStore(conversationsDir),
    );
    const runs = new RunRepository(runStateDir);
    const events = new ProcessingEventBus(
      new AppendOnlyProcessingEventStore(taskEventsDir),
    );

    server = await startHttpServer(
      {} as any,
      runs,
      events,
      resolve("app/web/dist"),
      0,
      undefined,
      intent,
      undefined,
      undefined,
      { workspaceRoot: temporaryRoot },
    );
    const base = baseUrl(server);

    // 1. Create a conversation
    const convRes = await fetch(`${base}/api/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Initial prompt" }),
    });
    assert.equal(convRes.status, 201);
    const conv = (await convRes.json()) as { conversation_id: string };
    assert.ok(conv.conversation_id);

    // 2. Normal message without run_id is accepted and stored
    const normalRes = await fetch(`${base}/api/conversations/${conv.conversation_id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "A normal chat message" }),
    });
    assert.equal(normalRes.status, 200);
    const normalBody = (await normalRes.json()) as { turns: Array<{ user_message?: string; message?: string }> };
    assert.ok(normalBody.turns.length >= 2); // initial + normal message
    assert.equal(normalBody.turns.at(-1)?.user_message, "A normal chat message");

    // 3. Message with invalid run_id is rejected (research-again requires valid run)
    const invalidRunRes = await fetch(`${base}/api/conversations/${conv.conversation_id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Test", run_id: "nonexistent-run-id", intent_kind: "research-again" }),
    });
    assert.equal(invalidRunRes.status, 404);

    // 4. research-again without a run_id is rejected
    const againNoRunRes = await fetch(`${base}/api/conversations/${conv.conversation_id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Research again please", intent_kind: "research-again" }),
    });
    assert.equal(againNoRunRes.status, 400);

    // 5. Unsupported intent_kind is rejected
    const unsupportedKindRes = await fetch(`${base}/api/conversations/${conv.conversation_id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Edit plan", intent_kind: "plan-edit" }),
    });
    assert.equal(unsupportedKindRes.status, 400);

    // 6. Requests reach the endpoint without any OneShot credential
    const postRes = await fetch(`${base}/api/conversations/${conv.conversation_id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Unauthenticated" }),
    });
    assert.notEqual(postRes.status, 401);
  } finally {
    if (server) await closeServer(server);
    await rm(temporaryRoot, { recursive: true, force: true });
    await new Promise((r) => setTimeout(r, 250));
  }
});
