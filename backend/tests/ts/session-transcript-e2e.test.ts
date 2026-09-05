import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import type {
  ResearchProvider,
  ResearchProviderReadiness,
} from "../../role/researcher/provider.js";
import type { ProcessingEventBus } from "../../runtime/event-bus.js";
import { FixtureResearchProvider } from "../../role/researcher/tool/fixture-provider.js";
import { ConversationStore } from "../../intent/conversation-store.js";
import { IntentCollectionService } from "../../intent/intent-collection.js";
import { PromptGenerator } from "../../intent/prompt-generator.js";
import { startHttpServer } from "../../server/http-server.js";
import { harness } from "./harness.js";

class CapturingResearchProvider implements ResearchProvider {
  receivedPrompt?: Prompt;

  constructor(private inner: ResearchProvider) {}

  ready(runId: string): Promise<ResearchProviderReadiness> {
    return this.inner.ready(runId);
  }

  attachEvents(events: ProcessingEventBus): void {
    this.inner.attachEvents?.(events);
  }

  async research(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    this.receivedPrompt = structuredClone(prompt);
    return await this.inner.research(prompt, runId);
  }

  close(): void {
    this.inner.close?.();
  }
}

async function waitForTerminal(base: string, runId: string): Promise<any> {
  for (let i = 0; i < 240; i += 1) {
    const response = await fetch(`${base}/api/runs/${runId}`);
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    if (snapshot.result) return snapshot;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`run ${runId} did not terminate`);
}

test("session start -> PromptGenerator -> Researcher -> canonical workflow -> final response emits full E2E transcript", async () => {
  const provider = new CapturingResearchProvider(new FixtureResearchProvider());
  const h = await harness("session-transcript-e2e", provider);
  const intent = new IntentCollectionService(new ConversationStore());
  const server = await startHttpServer(
    h.runtime,
    h.runs,
    h.events,
    resolve("ui"),
    0,
    h.task,
    intent,
  );

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const userMessage = [
      "Build a compact media utility that accepts MP4 and MP3 files.",
      "Produce a validated implementation plan with deterministic validation evidence and a final hash proof.",
    ].join(" ");
    console.log(`SESSION_START_INPUT_JSON=${JSON.stringify({ user_message: userMessage })}`);

    const conversationResponse = await fetch(`${base}/api/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: userMessage }),
    });
    assert.equal(conversationResponse.status, 201);
    const conversation = (await conversationResponse.json()) as any;
    console.log(`SESSION_START_RESPONSE_JSON=${JSON.stringify(conversation)}`);
    assert.equal(conversation.intent.ready_for_prompt, true);

    const promptResponse = await fetch(
      `${base}/api/conversations/${encodeURIComponent(conversation.conversation_id)}/prompt`,
      { method: "POST" },
    );
    assert.equal(promptResponse.status, 200);
    const httpPrompt = (await promptResponse.json()) as any;
    console.log(`HTTP_PROMPT_RESPONSE_JSON=${JSON.stringify(httpPrompt)}`);
    assert.equal(httpPrompt.result, "PASSED");
    assert.match(JSON.stringify(httpPrompt.prompt), /MP4/);
    assert.match(JSON.stringify(httpPrompt.prompt), /MP3/);

    const runResponse = await fetch(
      `${base}/api/conversations/${encodeURIComponent(conversation.conversation_id)}/run`,
      { method: "POST" },
    );
    assert.equal(runResponse.status, 202);
    const started = (await runResponse.json()) as any;
    console.log(`SESSION_RUN_CREATED_JSON=${JSON.stringify(started)}`);

    const final = await waitForTerminal(base, started.run_id);
    assert.ok(provider.receivedPrompt, "Researcher did not receive Prompt(id)");
    console.log(
      `RESEARCHER_RECEIVED_PROMPT_JSON=${JSON.stringify(provider.receivedPrompt)}`,
    );

    const expectedRunPrompt = new PromptGenerator().generate(
      conversation.intent,
      started.prompt_id,
    );
    assert.deepEqual(provider.receivedPrompt, expectedRunPrompt);

    const events = h.events.list(started.run_id);
    for (const event of events) {
      console.log(`SESSION_EVENT_JSON=${JSON.stringify(event)}`);
    }

    const terminalProcessors = [
      "Researcher",
      "Planner",
      "Refactor",
      "GapAnalysis",
      "Evaluation",
      "SchemaValidation",
      "FixtureValidation",
      "GoalValidation",
      "TripleValidation",
      "Confirmed",
      "CreateHash",
      "Builder",
      "Hash",
      "Done",
    ];
    for (const processor of terminalProcessors) {
      assert.ok(
        events.some((event) => event.processor === processor && event.state === "COMPLETE"),
        `missing terminal COMPLETE event for ${processor}`,
      );
    }

    const taskResponse = await fetch(`${base}/api/runs/${started.run_id}/task`);
    assert.equal(taskResponse.status, 200);
    const task = await taskResponse.json();
    console.log(`SESSION_TASK_FINAL_JSON=${JSON.stringify(task)}`);

    console.log(
      `SESSION_FINAL_RESPONSE_JSON=${JSON.stringify({
        run_id: final.run_id,
        result: final.result,
        current_processor: final.current_processor,
        hash_proof: final.hash_proof,
        event_count: events.length,
        last_event: events.at(-1),
      })}`,
    );

    assert.equal(final.result, "PASSED");
    assert.equal(final.hash_proof?.equal, true);
    assert.equal(task.checkpoint.last_processor, "Done");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((ok, fail) =>
      server.close((error) => (error ? fail(error) : ok())),
    );
    h.close();
  }
});
