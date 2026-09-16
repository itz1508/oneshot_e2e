import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Server } from "node:http";
import { startHttpServer } from "../../server/http-server.js";
import { IntentCollectionService } from "../../intent/intent-collection.js";
import { ConversationStore } from "../../intent/conversation-store.js";
import { RunRepository } from "../../runtime/run-repository.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";
import { AppendOnlyProcessingEventStore } from "../../task/event/event-store.js";
import { FileArtifactStore } from "../../runtime/artifact-store.js";
import { PlanReviewService } from "../../runtime/plan-review.js";
import { createFixtureResearchBundle } from "./fixture-helper.js";
import { prompt } from "./harness.js";
import { WorkflowRuntime } from "../../runtime/workflow-runtime.js";

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.();
  await new Promise<void>((ok, fail) =>
    server.close((error) => (error ? fail(error) : ok())),
  );
}

function baseUrl(server: Server): string {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

test("Research Drawer Backend: complete projection, revision-bound correction cycle, and agree review", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "oneshot-drawer-test-"));
  const conversationsDir = join(temporaryRoot, "conversations");
  const runStateDir = join(temporaryRoot, "runs");
  const taskEventsDir = join(temporaryRoot, "task-events");
  const artifactsDir = join(temporaryRoot, "artifacts");
  let server: Server | undefined;

  try {
    await mkdir(conversationsDir, { recursive: true });
    await mkdir(runStateDir, { recursive: true });
    await mkdir(taskEventsDir, { recursive: true });
    await mkdir(artifactsDir, { recursive: true });

    const convStore = new ConversationStore(conversationsDir);
    const intent = new IntentCollectionService(convStore);
    const runs = new RunRepository(runStateDir);
    const events = new ProcessingEventBus(
      new AppendOnlyProcessingEventStore(taskEventsDir),
    );
    const artifactStore = new FileArtifactStore(artifactsDir);
    const runtime = new WorkflowRuntime(
      events,
      runs,
      artifactStore,
      () => ({} as any),
    );

    server = await startHttpServer(
      runtime,
      runs,
      events,
      resolve("app/web/dist"),
      0,
      undefined,
      intent,
      undefined,
      undefined,
      { workspaceRoot: temporaryRoot },
    );
    const base = baseUrl(server);

    // 1. Unknown conversation returns 404
    const notFoundRes = await fetch(`${base}/conversations/unknown-id/research/drawer`);
    assert.equal(notFoundRes.status, 404);

    // 2. Create a conversation
    const createConvRes = await fetch(`${base}/api/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Build an audio processing utility that accepts mp3 and wav" }),
    });
    assert.equal(createConvRes.status, 201);
    const conv = await createConvRes.json();
    const conversationId = conv.conversation_id;
    assert.ok(conversationId);

    // 3. Initial Drawer Projection before any research run
    const drawer1Res = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/research/drawer`);
    assert.equal(drawer1Res.status, 200);
    const drawer1 = await drawer1Res.json();
    assert.equal(drawer1.conversation_id, conversationId);
    assert.equal(drawer1.status, "Drafting");
    assert.equal(drawer1.conversation_revision, 1);
    assert.equal(drawer1.research_revision, 1);
    assert.equal(drawer1.handoff.ready_for_planner, false);
    assert.ok(drawer1.summary.goal.includes("audio processing"));

    // Also test the /api prefix alias
    const drawerAliasRes = await fetch(`${base}/api/conversations/${encodeURIComponent(conversationId)}/research/drawer`);
    assert.equal(drawerAliasRes.status, 200);

    // 4. Create an associated run and open a PlanReview
    const runId = `run-${conversationId.replace(/[^a-zA-Z0-9-]/g, "")}`;
    runs.create(runId);
    runs.artifact(runId, `conversation:${conversationId}`, "linked");
    const bundle = await createFixtureResearchBundle(prompt(runId), runId);
    bundle.goal.objective = "Build an audio processing utility";
    await runtime.review.enable(runId);
    const draftReview = await runtime.review.open(runId, bundle, {
      conversation_id: conversationId,
      conversation_revision: conv.intent.revision,
      conversation_hash: conv.conversation_hash,
    });
    assert.ok(draftReview);
    assert.equal(draftReview.revision, 1);
    assert.equal(draftReview.status, "pending");

    // 5. Drawer projection now reflects "Needs Review"
    const drawer2Res = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/research/drawer`);
    assert.equal(drawer2Res.status, 200);
    const drawer2 = await drawer2Res.json();
    assert.equal(drawer2.status, "Needs Review");
    assert.equal(drawer2.review.status, "pending");
    assert.deepEqual(drawer2.review.allowed_actions, ["agree", "request_correction"]);
    assert.equal(drawer2.handoff.ready_for_planner, false);
    assert.ok(drawer2.research.facts.length > 0);

    // 6. Request Correction — Concurrency / Stale revision checks
    // 6a. Stale conversation revision fails with 409 Conflict
    const staleConvRes = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/research/corrections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expected_conversation_revision: 999, // stale
        expected_research_revision: 1,
        feedback: "The fixture needs to cover invalid file format handling.",
      }),
    });
    assert.equal(staleConvRes.status, 409);
    const staleConvBody = await staleConvRes.json();
    assert.ok(staleConvBody.error.includes("Stale conversation revision"));

    // 6b. Stale research revision fails with 409 Conflict
    const staleResearchRes = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/research/corrections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expected_conversation_revision: 1,
        expected_research_revision: 999, // stale
        feedback: "The fixture needs to cover invalid file format handling.",
      }),
    });
    assert.equal(staleResearchRes.status, 409);
    const staleResearchBody = await staleResearchRes.json();
    assert.ok(staleResearchBody.error.includes("Stale research revision"));

    // 6c. Missing feedback fails with 400 Bad Request
    const badReqRes = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/research/corrections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expected_conversation_revision: 1,
        expected_research_revision: 1,
        feedback: "   ",
      }),
    });
    assert.equal(badReqRes.status, 400);

    // 7. Valid Correction Submission
    const validCorrRes = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/research/corrections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expected_conversation_revision: 1,
        expected_research_revision: 1,
        feedback: "The fixture does not test corrupted header handling.",
        targets: [{ artifact_type: "FIXTURE", artifact_id: "fixture-1" }],
        idempotency_key: "idemp-001",
      }),
    });
    assert.equal(validCorrRes.status, 202);
    const corrBody = await validCorrRes.json();
    assert.equal(corrBody.accepted, true);
    assert.ok(corrBody.correction_id);
    assert.ok(corrBody.operation_id);
    assert.equal(corrBody.research_revision, 1);
    assert.equal(corrBody.status, "RECONCILING");

    // 7b. Idempotency test: duplicate call returns same correction ID
    const duplicateCorrRes = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/research/corrections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expected_conversation_revision: 1,
        expected_research_revision: 1,
        feedback: "The fixture does not test corrupted header handling.",
        idempotency_key: "idemp-001",
      }),
    });
    assert.equal(duplicateCorrRes.status, 202);
    const duplicateBody = await duplicateCorrRes.json();
    assert.equal(duplicateBody.correction_id, corrBody.correction_id);

    // Wait a brief moment for async correction DAG execution to commit Revision N+1
    await new Promise((r) => setTimeout(r, 100));

    // 8. Drawer Projection reflects Revision 2 awaiting review
    const drawer3Res = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/research/drawer`);
    assert.equal(drawer3Res.status, 200);
    const drawer3 = await drawer3Res.json();
    assert.equal(drawer3.research_revision, 2);
    assert.equal(drawer3.status, "Needs Review");
    assert.equal(drawer3.review.status, "pending");
    assert.equal(drawer3.handoff.ready_for_planner, false);

    // Verify parent revision 1 remains preserved on disk
    const rev1 = await artifactStore.load<any>(runId, "review.revision.2");
    assert.ok(rev1, "Revision 2 must be preserved");

    // 9. Stale agree review on old Revision 1 fails with 409
    const staleAgreeRes = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/research/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expected_conversation_revision: 1,
        expected_research_revision: 1, // stale, now on 2
      }),
    });
    assert.equal(staleAgreeRes.status, 409);

    // 10. Agree Review on current Revision 2 succeeds
    const validAgreeRes = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/research/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expected_conversation_revision: 1,
        expected_research_revision: 2,
        notes: ["Approved with corrupted header test."],
      }),
    });
    assert.equal(validAgreeRes.status, 200);
    const agreeBody = await validAgreeRes.json();
    assert.equal(agreeBody.status, "approved");
    assert.equal(agreeBody.review.status, "approved");
    assert.equal(agreeBody.review.revision, 3);

    // 11. Final Drawer Projection reflects "Ready" and ready_for_planner: true
    const drawerFinalRes = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/research/drawer`);
    assert.equal(drawerFinalRes.status, 200);
    const drawerFinal = await drawerFinalRes.json();
    assert.equal(drawerFinal.status, "Ready");
    assert.equal(drawerFinal.research_revision, 3);
    assert.equal(drawerFinal.review.status, "approved");
    assert.equal(drawerFinal.handoff.ready_for_planner, true);
    assert.equal(drawerFinal.build_readiness.lock_status, "LOCKED");
    assert.equal(drawerFinal.build_readiness.validation_status, "PASSED");
  } finally {
    if (server) await closeServer(server);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
