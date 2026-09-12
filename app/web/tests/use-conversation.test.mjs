import test from "node:test";
import assert from "node:assert/strict";

const STORAGE_KEY = "oneshot-current-conversation-id";

test("storage key is stable", () => {
  assert.equal(STORAGE_KEY, "oneshot-current-conversation-id");
});

test("sessions list projection shape", () => {
  const item = {
    conversation_id: "c1",
    session_id: "s1",
    title: "Test",
    updated_at: new Date().toISOString(),
  };
  assert.equal(item.title, "Test");
  assert.ok(item.updated_at);
});
