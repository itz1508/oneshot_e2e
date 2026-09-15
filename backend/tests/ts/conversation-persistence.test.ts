import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { ConversationStore } from "../../conversation/conversation-store.js";
import { MessageStore } from "../../conversation/message-store.js";
import type { Conversation } from "../../conversation/types.js";

function newConv(): Conversation {
  const now = new Date().toISOString();
  return { conversationId: `conv:${randomUUID()}`, title: "Test", createdAt: now, updatedAt: now };
}

test("M14: conversations survive page reload (durable storage)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m14-durable-"));
  try {
    const store1 = new ConversationStore(dir);
    const conv = newConv();
    store1.save(conv);
    const store2 = new ConversationStore(dir);
    const loaded = store2.get(conv.conversationId);
    assert.ok(loaded, "conversation must survive reload");
    assert.equal(loaded!.conversationId, conv.conversationId);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("M14: messages have stable ordering (sequence numbers)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m14-order-"));
  try {
    const store = new ConversationStore(dir);
    const msgs = new MessageStore(dir);
    const conv = newConv();
    store.save(conv);
    const m1 = msgs.add({ messageId: "m1", conversationId: conv.conversationId, role: "user", content: "hello", status: "completed" });
    const m2 = msgs.add({ messageId: "m2", conversationId: conv.conversationId, role: "assistant", content: "hi", status: "completed" });
    assert.equal(m1.sequence, 1);
    assert.equal(m2.sequence, 2);
    assert.deepEqual(msgs.list(conv.conversationId).map((m) => m.messageId), ["m1", "m2"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("M14: runs are associated with conversations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m14-runs-"));
  try {
    const store = new ConversationStore(dir);
    const msgs = new MessageStore(dir);
    const conv = newConv();
    store.save(conv);
    const msg = msgs.add({
      messageId: "m1", conversationId: conv.conversationId,
      role: "assistant", content: "running...", status: "streaming", runId: "run:test-001",
    });
    assert.equal(msg.runId, "run:test-001");
    assert.equal(msgs.get(conv.conversationId, "m1")?.runId, "run:test-001");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("M14: partial (streaming) messages are recoverable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m14-partial-"));
  try {
    const store = new ConversationStore(dir);
    const msgs = new MessageStore(dir);
    const conv = newConv();
    store.save(conv);
    msgs.add({ messageId: "m1", conversationId: conv.conversationId, role: "user", content: "hello", status: "completed" });
    msgs.add({ messageId: "m2", conversationId: conv.conversationId, role: "assistant", content: "partial...", status: "streaming" });
    const msgs2 = new MessageStore(dir);
    const partial = msgs2.recoverPartial(conv.conversationId);
    assert.equal(partial.length, 1);
    assert.equal(partial[0].status, "streaming");
    const updated = msgs2.update(conv.conversationId, "m2", { status: "completed", content: "full" });
    assert.equal(updated?.status, "completed");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("M14: messages survive page reload", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m14-reload-"));
  try {
    const store = new ConversationStore(dir);
    const msgs = new MessageStore(dir);
    const conv = newConv();
    store.save(conv);
    msgs.add({ messageId: "m1", conversationId: conv.conversationId, role: "user", content: "hello", status: "completed" });
    msgs.add({ messageId: "m2", conversationId: conv.conversationId, role: "assistant", content: "hi", status: "completed" });
    const msgs2 = new MessageStore(dir);
    const list = msgs2.list(conv.conversationId);
    assert.equal(list.length, 2);
    assert.equal(list[0].messageId, "m1");
    assert.equal(list[1].messageId, "m2");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("M14: credentials and hidden reasoning are never persisted", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m14-nosec-"));
  try {
    const store = new ConversationStore(dir);
    const msgs = new MessageStore(dir);
    const conv = newConv();
    store.save(conv);
    msgs.add({ messageId: "m1", conversationId: conv.conversationId, role: "user", content: "hello", status: "completed" });
    const msg = msgs.get(conv.conversationId, "m1")!;
    const keys = Object.keys(msg);
    assert.ok(!keys.includes("apiKey"), "no apiKey");
    assert.ok(!keys.includes("credential"), "no credential");
    assert.ok(!keys.includes("systemPrompt"), "no systemPrompt");
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync(join(dir, `${conv.conversationId.replace(/[^a-zA-Z0-9._-]/g, "_")}.messages.json`), "utf8");
    assert.ok(!raw.includes("apiKey"), "no apiKey in file");
    assert.ok(!raw.includes("secret"), "no secret in file");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
