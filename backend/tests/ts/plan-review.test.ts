import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PlanReviewService } from "../../runtime/plan-review.js";
import { FileArtifactStore } from "../../runtime/artifact-store.js";
import { harness, prompt } from "./harness.js";
import { startHttpServer } from "../../server/http-server.js";
import { IntentCollectionService } from "../../intent/intent-collection.js";
import { ConversationStore } from "../../intent/conversation-store.js";

test("review persists decisions and validates identities, empty edits and stale confirmations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "oneshot-review-"));
  const seed = await harness("review-unit-seed");
  try {
    const store = new FileArtifactStore(dir);
    const producer = new PlanReviewService(store);
    const consumer = new PlanReviewService(store);
    const bundle = await seed.researcher.run(prompt("review-unit"), "review-unit");
    assert.equal(await producer.open('automatic', bundle), undefined);
    await producer.enable('review-unit');
    const draft = (await producer.open('review-unit', bundle))!;
    await assert.rejects(() => producer.decide('review-unit', { action: 'approve', revision: 0, edits: draft.edits }), /reload/);
    await assert.rejects(() => producer.decide('review-unit', { action: 'approve', revision: 1, edits: { ...draft.edits, objective: '' } }), /characters/);
    await assert.rejects(() => producer.decide('review-unit', { action: 'approve', revision: 1, edits: { ...draft.edits, steps: [{ id: 'invented', description: 'Changed' }] } }), /identit/);
    draft.edits.notes = ['Preserve public behavior.'];
    draft.edits.steps[0].description += ' Preserve public behavior.';
    const waiting = consumer.wait('review-unit', () => false);
    const approved = await producer.decide('review-unit', { action: 'approve', revision: 1, edits: draft.edits });
    assert.equal(approved.status, 'approved');
    const reviewed = await waiting;
    assert.equal(reviewed.plan.steps[0].description, draft.edits.steps[0].description);
    assert.equal(reviewed.prompt.context.at(-1)?.statement, draft.edits.notes[0]);
    assert.deepEqual(reviewed.plan.steps[0].requirement_refs, bundle.plan.steps[0].requirement_refs);
    await assert.rejects(() => producer.decide('review-unit', { action: 'approve', revision: 1, edits: draft.edits }), /already/);
    assert.equal((await new PlanReviewService(store).get('review-unit'))?.status, 'approved');
  } finally { seed.close(); await rm(dir, { recursive: true, force: true }); }
});

for (const action of ['approve', 'cancel'] as const) {
  test(`workflow review HTTP ${action}: Planner waits for a real user decision`, { timeout: 45000 }, async () => {
    const runId = `review-${randomUUID()}`;
    const h = await harness(runId);
    const server = await startHttpServer(h.runtime, h.runs, h.events, join(process.cwd(), 'app/web/dist'), 0, undefined, undefined, undefined, undefined, { workspaceRoot: process.cwd() });
    let execution: ReturnType<typeof h.runtime.run> | undefined;
    try {
      h.runs.create(runId);
      await h.runtime.review.enable(runId);
      execution = h.runtime.run(runId, prompt(runId));
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const url = `http://127.0.0.1:${address.port}/api/runs/${runId}/review`;
      let draft;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const response = await fetch(url);
        if (response.ok) { draft = await response.json(); break; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.ok(draft, 'review must become available');
      assert.equal(draft.status, 'pending');
      assert.equal(h.runs.require(runId).events.some(e => e.processor === 'Planner' && e.execution_status === 'Running'), false);
      const result = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, revision: draft.revision, edits: draft.edits }) });
      assert.equal(result.status, 200);
      const finished = await execution;
      assert.equal(finished.test_result, action === 'approve' ? 'Passed' : 'Failed');
      assert.equal(finished.issue_type, action === 'approve' ? undefined : 'Root Cause');
      assert.equal(finished.events.some(e => e.processor === 'Planner' && e.execution_status === 'Running'), action === 'approve');
      if (action === 'approve') assert.ok(finished.hash_proof?.equal);
      else assert.match(finished.root_cause?.actual || '', /cancelled/i);
      const duplicate = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, revision: draft.revision, edits: draft.edits }) });
      assert.equal(duplicate.status, 409);
    } finally {
      const pending = await h.runtime.review.get(runId);
      if (pending?.status === 'pending') await h.runtime.review.decide(runId, { action: 'cancel', revision: pending.revision });
      await execution;
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      h.bridge.close();
    }
  });
}
