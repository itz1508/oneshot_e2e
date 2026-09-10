import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("official AI SDK adapters replace hand-written provider protocol", () => {
  const openai = readFileSync("backend/provider/adapter/openai.ts", "utf8");
  const anthropic = readFileSync("backend/provider/adapter/anthropic.ts", "utf8");
  const google = readFileSync("backend/provider/adapter/google.ts", "utf8");
  assert.match(openai, /@ai-sdk\/openai/);
  assert.match(anthropic, /@ai-sdk\/anthropic/);
  assert.match(google, /@ai-sdk\/google/);
  for (const source of [openai, anthropic, google]) {
    assert.match(source, /generateText/);
    assert.doesNotMatch(source, /ResearchBundle|fixture_id|goal_id|research\s*\(/);
  }
});
