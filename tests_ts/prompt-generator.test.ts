import test from "node:test";
import assert from "node:assert/strict";
import { ConversationStore } from "../backend/intent/conversation-store.js";
import { IntentCollectionService } from "../backend/intent/intent-collection.js";
import { PromptGenerator } from "../backend/intent/prompt-generator.js";

test("PromptGenerator emits a job-specific Researcher work order without scope invention", () => {
  const service = new IntentCollectionService(new ConversationStore());
  const message = [
    "Build a compact media utility that accepts MP4 and MP3 files.",
    "Produce a validated implementation plan with deterministic validation evidence and a final hash proof.",
  ].join(" ");
  const conversation = service.start(message);
  console.log(
    `PROMPT_GENERATOR_INPUT_JSON=${JSON.stringify({ message, intent: conversation.intent })}`,
  );

  const result = service.createPrompt(
    conversation.conversation_id,
    "prompt:media-job",
  );
  assert.equal(result.result, "PASSED");
  if (result.result !== "PASSED") throw new Error("expected prompt");
  console.log(`PROMPT_GENERATOR_OUTPUT_JSON=${JSON.stringify(result.prompt)}`);

  const text = JSON.stringify(result.prompt).toLowerCase();
  assert.match(text, /mp4/);
  assert.match(text, /mp3/);
  assert.match(text, /deterministic validation evidence/);
  assert.match(text, /final hash proof/);
  assert.match(text, /unsupported behavior as unknown/);
  for (const unsupported of ["kubernetes", "database", "upload", "streaming", "cloud run"]) {
    assert.equal(text.includes(unsupported), false, `invented scope: ${unsupported}`);
  }
});

test("PromptGenerator preserves multi-turn intent identity, provenance, requirements, and constraints", () => {
  const service = new IntentCollectionService(new ConversationStore());
  const first = service.start("Build a local media utility that accepts MP4 files.");
  const intentId = first.intent.intent_id;
  const refined = service.addTurn(
    first.conversation_id,
    "It must also support MP3 files. It must run offline.",
  );
  assert.equal(refined.intent.intent_id, intentId);
  assert.equal(refined.intent.revision, 2);
  assert.equal(refined.intent.source_turn_ids.length, 2);

  const result = service.createPrompt(first.conversation_id, "prompt:refined");
  assert.equal(result.result, "PASSED");
  if (result.result !== "PASSED") throw new Error("expected prompt");
  const output = JSON.stringify(result.prompt);
  assert.match(output, /MP4/);
  assert.match(output, /MP3/);
  assert.match(output, /offline/i);
  assert.equal(result.prompt.context.length, 2);
});

test("PromptGenerator is not invoked for vague input; HelpRequest remains the boundary", () => {
  const service = new IntentCollectionService(new ConversationStore());
  const conversation = service.start("Build it.");
  const result = service.createPrompt(conversation.conversation_id, "prompt:vague");
  assert.equal(result.result, "ROOT_CAUSE");
  if (result.result !== "ROOT_CAUSE") throw new Error("expected root cause");
  assert.equal(result.help_request.source_processor, "IntentCollection");
  assert.equal(result.help_request.required_information[0], "goal");
  assert.equal("prompt" in result, false);
});

test("PromptGenerator output can be reconstructed exactly from the same IntentState and prompt_id", () => {
  const service = new IntentCollectionService(new ConversationStore());
  const conversation = service.start(
    "Build a deterministic media support checker. It must support MP4 and MP3 only.",
  );
  const result = service.createPrompt(conversation.conversation_id, "prompt:exact");
  assert.equal(result.result, "PASSED");
  if (result.result !== "PASSED") throw new Error("expected prompt");

  const expected = new PromptGenerator().generate(result.intent, "prompt:exact");
  assert.deepEqual(result.prompt, expected);
});
