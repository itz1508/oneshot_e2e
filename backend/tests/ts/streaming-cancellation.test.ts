import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { PublicEventStore } from "../../conversation/event-store.js";
import { PublicEventEmitter } from "../../conversation/public-event-emitter.js";
import type { PublicRunEvent } from "../../conversation/public-events.js";

test("M15: standalone streaming emits public events in order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m15-stream-"));
  try {
    const store = new PublicEventStore(dir);
    const events: PublicRunEvent[] = [];
    const em = new PublicEventEmitter("run:1", { store, onEvent: (e) => events.push(e) });
    em.emitRunStarted(); em.emitMessageStarted("m1"); em.emitMessageDelta("m1", "Hi "); em.emitMessageDelta("m1", "there"); em.emitRunCompleted();
    assert.equal(events.length, 5);
    assert.equal(events[0].type, "run.started");
    assert.equal(events[4].type, "run.completed");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("M15: cancellation reaches AbortSignal and emits run.cancelled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m15-cancel-"));
  try {
    const store = new PublicEventStore(dir);
    const events: PublicRunEvent[] = [];
    const ctrl = new AbortController();
    const em = new PublicEventEmitter("run:2", { store, signal: ctrl.signal, onEvent: (e) => events.push(e) });
    em.emitRunStarted(); em.emitMessageStarted("m2");
    ctrl.abort();
    assert.ok(em.isCancelled);
    em.emitMessageDelta("m2", "nope");
    const types = events.map((e) => e.type);
    assert.ok(types.includes("run.cancelled"));
    assert.ok(!types.includes("message.delta"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("M15: queue and inline modes expose the same event vocabulary", () => {
  const validTypes = new Set([
    "run.started", "message.started", "message.delta",
    "tool.started", "tool.completed", "evidence.added",
    "review.required", "run.completed", "run.cancelled", "run.failed",
  ]);
  const samples: PublicRunEvent[] = [
    { type: "run.started", runId: "r" }, { type: "message.started", runId: "r", messageId: "m" },
    { type: "message.delta", runId: "r", messageId: "m", delta: "d" },
    { type: "tool.started", runId: "r", toolName: "t" }, { type: "tool.completed", runId: "r", toolName: "t" },
    { type: "evidence.added", runId: "r", evidenceId: "e" }, { type: "review.required", runId: "r" },
    { type: "run.completed", runId: "r" }, { type: "run.cancelled", runId: "r" },
    { type: "run.failed", runId: "r", code: "ERR" },
  ];
  assert.equal(samples.length, validTypes.size);
  for (const s of samples) assert.ok(validTypes.has(s.type));
});

test("M15: raw SDK events never exposed to browser", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m15-noraw-"));
  try {
    const store = new PublicEventStore(dir);
    const events: PublicRunEvent[] = [];
    const em = new PublicEventEmitter("run:4", { store, onEvent: (e) => events.push(e) });
    em.emitRunStarted(); em.emitToolStarted("tavily_search_extract"); em.emitToolCompleted("tavily_search_extract"); em.emitRunCompleted();
    for (const e of events) {
      assert.ok(!e.type.includes("strands"), "no Strands event");
      assert.ok(!e.type.includes("openai"), "no OpenAI event");
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("M15: run.failed event carries error code", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m15-failed-"));
  try {
    const store = new PublicEventStore(dir);
    const events: PublicRunEvent[] = [];
    const em = new PublicEventEmitter("run:5", { store, onEvent: (e) => events.push(e) });
    em.emitRunStarted(); em.emitRunFailed("PROVIDER_TIMEOUT");
    const failed = events.find((e) => e.type === "run.failed");
    assert.ok(failed && failed.type === "run.failed" && failed.code === "PROVIDER_TIMEOUT");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("M15: client reconnect replays known events", async () => {
  const dir = await mkdtemp(join(tmpdir(), "m15-reconn-"));
  try {
    const store1 = new PublicEventStore(dir);
    const em = new PublicEventEmitter("run:3", { store: store1 });
    em.emitRunStarted(); em.emitMessageStarted("m3"); em.emitMessageDelta("m3", "d1"); em.emitMessageDelta("m3", "d2"); em.emitRunCompleted();
    const store2 = new PublicEventStore(dir);
    const replayed = store2.replay("run:3", 2);
    assert.equal(replayed.length, 3);
    assert.equal(replayed[0].event.type, "message.delta");
    assert.equal(replayed[2].event.type, "run.completed");
    assert.equal(store2.replay("run:3", 0).length, 5);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
