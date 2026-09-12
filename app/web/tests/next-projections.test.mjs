import test from "node:test";
import assert from "node:assert/strict";

function deriveTurnTitle(turn, max = 80) {
  const text = turn.user_message.trim();
  if (!text) return "Empty turn";
  const firstLine = text.split("\n")[0].trim().replace(/^[\s>#\-•]+/, "");
  if (!firstLine) return "Empty turn";
  if (firstLine.length <= max) return firstLine;
  const truncated = firstLine.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

test("deriveTurnTitle extracts first line without cutting words", () => {
  const turn = {
    turn_id: "t1",
    turn_number: 1,
    user_message: "First line\nSecond line",
    created_at: new Date().toISOString(),
  };
  assert.equal(deriveTurnTitle(turn), "First line");
});

test("deriveTurnTitle truncates long lines at word boundary", () => {
  const turn = {
    turn_id: "t2",
    turn_number: 2,
    user_message: "a".repeat(120),
    created_at: new Date().toISOString(),
  };
  const title = deriveTurnTitle(turn, 80);
  assert.ok(title.endsWith("…"));
  assert.ok(title.length <= 81);
});
