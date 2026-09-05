import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { ConversationStore } from "../../intent/conversation-store.js";
import { IntentCollectionService } from "../../intent/intent-collection.js";
import { projectIntentGraph } from "../../graph/intent-graph.js";
import { IntentCollectionSkill } from "../../skills/intent-collection-skill.js";

test("multi-turn Intent keeps identity, asks targeted help, then creates Prompt(id)", async () => {
  const root = resolve(`.runtime/test-harness/intent/${process.pid}`);
  await rm(root, { recursive: true, force: true });
  const svc = new IntentCollectionService(new ConversationStore(root));
  const a = svc.start("I want to build something");
  assert.equal(a.intent.ready_for_prompt, false);
  assert.equal(a.intent.revision, 1);
  const blocked = svc.createPrompt(a.conversation_id, "prompt:test");
  assert.equal(blocked.result, "ROOT_CAUSE");
  if (blocked.result !== "ROOT_CAUSE") throw new Error("expected root cause");
  assert.equal(blocked.root_cause.issue, "Additional information required");
  assert.equal(blocked.help_request.required_information[0], "goal");
  assert.match(blocked.help_request.question, /specifically/i);
  const sameIntent = a.intent.intent_id;
  const b = svc.addTurn(
    a.conversation_id,
    "Build a multimedia player that supports audio, video, and images. Keep the interface simple.",
  );
  assert.equal(b.intent.intent_id, sameIntent);
  assert.equal(b.intent.revision, 2);
  assert.equal(b.intent.ready_for_prompt, true);
  assert.equal(b.turns.length, 2);
  const ready = svc.createPrompt(a.conversation_id, "prompt:test");
  assert.equal(ready.result, "PASSED");
  if (ready.result !== "PASSED") throw new Error("expected prompt");
  assert.equal(ready.prompt.prompt_id, "prompt:test");
  assert.match(ready.prompt.intent, /multimedia player/i);
  const directions = ready.prompt.research_direction.join("\n");
  assert.match(directions, /multimedia player/i);
  assert.match(directions, /audio, video, and images/i);
  assert.match(directions, /requested outcome/i);
  assert.match(directions, /unsupported behavior as unknown/i);
  assert.equal(
    ready.prompt.research_direction.some((x) => x.startsWith("Requirements:")),
    false,
  );
  assert.equal(ready.intent.source_turn_ids.length, 2);
  assert.ok(
    ready.intent.statements.some((x) =>
      x.source_turn_ids.includes(b.turns[1].turn_id),
    ),
  );
  const graph = projectIntentGraph(b);
  assert.equal(
    graph.nodes.find((x) => x.id === "prompt")?.state,
    "COMPLETE",
  );
  const skill = new IntentCollectionSkill(svc);
  assert.deepEqual(
    skill
      .definitions()
      .map((x) => x.name)
      .sort(),
    ["get_intent", "project_intent_graph"],
  );
  const projected = await skill.invoke<any>("get_intent", {
    conversation_id: a.conversation_id,
  });
  assert.equal(projected.intent.intent_id, sameIntent);
  const reloaded = new IntentCollectionService(
    new ConversationStore(root),
  ).get(a.conversation_id);
  assert.equal(reloaded?.intent.intent_id, sameIntent);
  assert.equal(reloaded?.turns.length, 2);
});

test("Prompt(id) carries explicit requirements and constraints into job-specific research directions", async () => {
  const root = resolve(`data/test-intent-prompt-direction/${process.pid}`);
  await rm(root, { recursive: true, force: true });
  const svc = new IntentCollectionService(new ConversationStore(root));
  const userMessage =
    "Build a local media catalog. It must support audio and video. It must run offline.";
  const conversation = svc.start(userMessage);

  const result = svc.createPrompt(
    conversation.conversation_id,
    "prompt:structured-direction",
  );
  assert.equal(result.result, "PASSED");
  if (result.result !== "PASSED") throw new Error("expected prompt");

  assert.deepEqual(Object.keys(result.prompt).sort(), [
    "context",
    "intent",
    "prompt_id",
    "requested_outcome",
    "research_direction",
  ]);
  assert.equal(result.prompt.context.length, 1);
  assert.equal(result.prompt.context[0].statement, userMessage);
  assert.ok(
    result.prompt.research_direction.includes(
      "Investigate how to satisfy and prove this explicit user requirement without expanding its scope: It must support audio and video.",
    ),
  );
  assert.ok(
    result.prompt.research_direction.includes(
      "Determine the repository or runtime implications of this explicit user constraint and preserve it: It must run offline.",
    ),
  );
  assert.equal(result.prompt.research_direction.includes("requirements"), false);
});

test("Intent accepts the IDE audit command as a concrete goal", async () => {
  const root = resolve(`.runtime/test-harness/intent-audit/${process.pid}`);
  await rm(root, { recursive: true, force: true });
  const svc = new IntentCollectionService(new ConversationStore(root));
  const conversation = svc.start(
    "Audit this project and produce a verified implementation plan.",
  );

  assert.equal(conversation.intent.ready_for_prompt, true);
  assert.match(conversation.intent.goal || "", /audit this project/i);
  assert.equal(
    svc.createPrompt(conversation.conversation_id, "prompt:audit").result,
    "PASSED",
  );
});

test("Intent automatically derives sufficient intent from natural conversational requests without rigid keywords", async () => {
  const root = resolve(`.runtime/test-harness/intent-natural/${process.pid}`);
  await rm(root, { recursive: true, force: true });
  const svc = new IntentCollectionService(new ConversationStore(root));

  const conv1 = svc.start(
    "Explain what JSON Schema is and give me 3 practical reasons to use it in an API project.",
  );
  assert.equal(conv1.intent.ready_for_prompt, true);
  assert.match(conv1.intent.goal || "", /json schema/i);
  assert.match(conv1.intent.requested_outcome || "", /3 practical reasons|json schema/i);
  const prompt1 = svc.createPrompt(conv1.conversation_id, "prompt:json-schema");
  assert.equal(prompt1.result, "PASSED");

  const conv2 = svc.start("Write a Python prime checker.");
  assert.equal(conv2.intent.ready_for_prompt, true);
  assert.match(conv2.intent.goal || "", /prime checker/i);
  const prompt2 = svc.createPrompt(conv2.conversation_id, "prompt:prime-checker");
  assert.equal(prompt2.result, "PASSED");

  const conv3 = svc.start("Build it.");
  assert.equal(conv3.intent.ready_for_prompt, false);
  const prompt3 = svc.createPrompt(conv3.conversation_id, "prompt:vague");
  assert.equal(prompt3.result, "ROOT_CAUSE");
  if (prompt3.result === "ROOT_CAUSE") {
    assert.equal(prompt3.help_request.required_information[0], "goal");
  }
});
