import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { ProcessingEvent } from "../../contracts/schema/types.js";
import { resolveResearchProvider } from "../../role/researcher/provider-resolver.js";
import { ConversationStore } from "../../intent/conversation-store.js";
import { IntentCollectionService } from "../../intent/intent-collection.js";
import { startHttpServer } from "../../server/http-server.js";
import { harness } from "./harness.js";

function print(label: string, value: unknown): void {
  console.log(`${label}=${JSON.stringify(value)}`);
}

async function collectWorkflowEvents(url: string): Promise<ProcessingEvent[]> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 15_000);
  const events: ProcessingEvent[] = [];
  try {
    const response = await fetch(url, {
      headers: { accept: "text/event-stream" },
      signal: abort.signal,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
    assert.ok(response.body, "SSE response has no body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let terminal = false;

    while (!terminal) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (!data) continue;
        const event = JSON.parse(data) as ProcessingEvent;
        events.push(event);
        print("WORKFLOW_EVENT_JSON", event);
        if (event.processor === "Done" && event.state === "COMPLETE") {
          terminal = true;
          break;
        }
      }
    }

    await reader.cancel();
    assert.ok(terminal, "SSE stream did not reach Done COMPLETE");
    return events;
  } finally {
    clearTimeout(timeout);
  }
}

test(
  "real HTTP conversation session prints input, every SSE workflow event, role artifacts, and final task projection",
  { timeout: 30_000 },
  async () => {
    const saved = {
      mode: process.env.ONESHOT_MODE,
      provider: process.env.ONESHOT_RESEARCH_PROVIDER,
      draft: process.env.ONESHOT_ADK_TEST_DRAFT_FILE,
    };

    process.env.ONESHOT_MODE = "production";
    process.env.ONESHOT_RESEARCH_PROVIDER = "adk_gemma2";
    process.env.ONESHOT_ADK_TEST_DRAFT_FILE = "app/fixtures/provider/adk-research-draft.json";

    const provider = await resolveResearchProvider(process.cwd());
    const h = await harness("adk-session-trace", provider);
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

      const userMessage =
        "Build a compact media utility that accepts MP4 and MP3 files. Produce a validated implementation plan with deterministic validation evidence and a final hash proof.";
      print("SESSION_TEST_INPUT_JSON", { user_message: userMessage });

      const conversationResponse = await fetch(`${base}/api/conversations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      assert.equal(conversationResponse.status, 201);
      const conversation = (await conversationResponse.json()) as any;
      print("CONVERSATION_CREATED_JSON", conversation);
      assert.equal(conversation.intent.ready_for_prompt, true);

      const runResponse = await fetch(
        `${base}/api/conversations/${encodeURIComponent(conversation.conversation_id)}/run`,
        { method: "POST" },
      );
      assert.equal(runResponse.status, 202);
      const started = (await runResponse.json()) as {
        run_id: string;
        prompt_id: string;
        intent_id: string;
        intent_revision: number;
      };
      print("RUN_CREATED_JSON", started);

      const streamEvents = await collectWorkflowEvents(
        `${base}/api/runs/${started.run_id}/events`,
      );

      for (let index = 0; index < streamEvents.length; index += 1) {
        assert.equal(streamEvents[index].sequence, index + 1);
        assert.equal(streamEvents[index].run_id, started.run_id);
      }

      const requiredCompleteProcessors = [
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
      for (const processor of requiredCompleteProcessors) {
        assert.ok(
          streamEvents.some(
            (event) => event.processor === processor && event.state === "COMPLETE",
          ),
          `missing ${processor} COMPLETE event`,
        );
      }

      const snapshotResponse = await fetch(`${base}/api/runs/${started.run_id}`);
      assert.equal(snapshotResponse.status, 200);
      const snapshot = (await snapshotResponse.json()) as any;
      print("FINAL_RUN_SNAPSHOT_JSON", snapshot);

      const artifactNames = [
        "prompt",
        "researcher",
        "plan.researcher",
        "schema",
        "fixture",
        "goal",
        "validation",
        "audit",
        "plan.refactored",
        "plan.gap",
        "gap",
        "evaluation",
        "triple-validation",
        "confirmed",
        "confirmed-hash",
        "builder-result",
        "hash-proof",
      ];
      const artifacts: Record<string, unknown> = {};
      for (const name of artifactNames) {
        const value = await h.store.load<unknown>(started.run_id, name);
        if (value !== undefined) {
          artifacts[name] = value;
          print("WORKFLOW_ARTIFACT_JSON", { name, value });
        }
      }

      const runSnapshot = h.runs.require(started.run_id);
      const taskProjection = h.task.projection(started.run_id, runSnapshot);
      print("TASK_MANAGEMENT_PROJECTION_JSON", taskProjection);

      print("SESSION_END_JSON", {
        conversation_id: conversation.conversation_id,
        session_id: conversation.session_id,
        run_id: started.run_id,
        prompt_id: started.prompt_id,
        event_count: streamEvents.length,
        final_result: snapshot.result,
        artifact_names: Object.keys(artifacts),
        last_event: streamEvents.at(-1),
      });

      assert.equal(snapshot.result, "PASSED");
      assert.equal(streamEvents.at(-1)?.processor, "Done");
      assert.equal(streamEvents.at(-1)?.state, "COMPLETE");
    } finally {
      server.closeAllConnections();
      await new Promise<void>((ok, fail) =>
        server.close((error) => (error ? fail(error) : ok())),
      );
      provider.close?.();
      h.close();
      for (const [key, value] of Object.entries(saved)) {
        const name =
          key === "mode"
            ? "ONESHOT_MODE"
            : key === "provider"
              ? "ONESHOT_RESEARCH_PROVIDER"
              : "ONESHOT_ADK_TEST_DRAFT_FILE";
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  },
);
