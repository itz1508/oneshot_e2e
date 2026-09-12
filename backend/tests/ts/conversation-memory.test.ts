import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { ConversationStore } from "../../intent/conversation-store.js";
import { IntentCollectionService } from "../../intent/intent-collection.js";
import { projectConversationContext } from "../../memory/memory-projection.js";

test("memory is recorded per turn, normalised on load, and projection obeys fixed intent", async () => {
  const root = resolve(`.runtime/test-harness/conversation-memory/${process.pid}`);
  await rm(root, { recursive: true, force: true });
  const svc = new IntentCollectionService(new ConversationStore(root));

  const a = svc.start(
    "Build a local media catalog. It must support audio and video. It must run offline.",
  );

  assert.ok(a.memory);
  assert.equal(a.memory.fixed_intent_enabled, false);
  assert.equal(a.memory.records.length, 1);
  assert.equal(a.memory.sections.length, 1);
  assert.equal(a.memory.summaries.length, 1);
  // type_ids are canonical provenance from IntentCollectionService.merge().
  assert.equal(a.memory.records[0].type_ids.includes("goal"), true);
  assert.equal(a.memory.records[0].text, a.turns[0].user_message);
  assert.ok(a.memory.summaries[0].body);
  assert.ok(a.memory.summaries[0].source_digest);

  const summaryId = a.memory.summaries[0].summary_id;
  const firstDigest = a.memory.summaries[0].source_digest;

  const b = svc.addTurn(
    a.conversation_id,
    "Add podcast support and keep search under 200ms.",
  );
  assert.equal(b.memory.records.length, 2);
  assert.equal(b.memory.sections.length, 1);
  assert.equal(b.memory.summaries.length, 1);
  assert.equal(b.memory.summaries[0].summary_id, summaryId);
  // New source record changes the digest, so summary is regenerated.
  assert.notEqual(b.memory.summaries[0].source_digest, firstDigest);
  assert.ok(b.memory.summaries[0].body);

  // Toggle ON does not invalidate the summary.
  const on = svc.setFixedIntent(a.conversation_id, true);
  assert.equal(on.memory.fixed_intent_enabled, true);
  assert.equal(on.memory.summaries[0].source_digest, b.memory.summaries[0].source_digest);
  assert.equal(on.memory.summaries[0].body, b.memory.summaries[0].body);

  // Projection with fixed intent ON uses summary bodies for represented turns.
  const projectedOn = projectConversationContext(on);
  assert.ok(projectedOn.length > 0);
  assert.ok(projectedOn.some((x) => x.includes(b.turns[0].user_message) || x.includes("Goal:") || x.includes("Context:")));

  // Toggle OFF returns raw turn texts.
  const off = svc.setFixedIntent(a.conversation_id, false);
  const projectedOff = projectConversationContext(off);
  assert.equal(projectedOff.length, off.turns.length);
  assert.ok(projectedOff.every((x) => off.turns.some((t) => t.user_message.includes(x) || x.includes(t.user_message))));

  // List endpoint derives title from first user turn.
  const list = svc.listConversations();
  assert.equal(list.length, 1);
  assert.match(list[0].title, /local media catalog/i);
  assert.equal(list[0].conversation_id, a.conversation_id);

  // Reload from disk normalises missing memory.
  const reloaded = new IntentCollectionService(new ConversationStore(root)).get(
    a.conversation_id,
  );
  assert.ok(reloaded);
  assert.equal(reloaded!.memory.records.length, 2);
});

test("legacy snapshots without memory load with normalised empty memory", async () => {
  const root = resolve(`.runtime/test-harness/conversation-memory-legacy/${process.pid}`);
  await rm(root, { recursive: true, force: true });
  const store = new ConversationStore(root);
  const legacy = {
    conversation_id: "conversation:legacy-1",
    session_id: "session:legacy-1",
    turns: [
      {
        turn_id: "turn:legacy-1",
        turn_number: 1,
        user_message: "Legacy conversation",
        created_at: new Date().toISOString(),
      },
    ],
    intent: {
      intent_id: "intent:legacy-1",
      revision: 1,
      conversation_id: "conversation:legacy-1",
      source_turn_ids: ["turn:legacy-1"],
      goal: "Legacy goal",
      requested_outcome: "Legacy outcome",
      requirements: [],
      constraints: [],
      context: ["Legacy conversation"],
      statements: [],
      missing_required_information: [],
      ready_for_prompt: true,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.save(legacy as any);

  const reloaded = store.get("conversation:legacy-1");
  assert.ok(reloaded);
  assert.equal(reloaded!.memory.fixed_intent_enabled, false);
  assert.equal(reloaded!.memory.records.length, 0);
  assert.equal(reloaded!.memory.summaries.length, 0);
});
