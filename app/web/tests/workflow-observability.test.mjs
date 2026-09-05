import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { workflowTraceStore } from '../src/workflow-trace.js';
import { createWorkflowTracePanel } from '../src/workflow-trace-panel.js';
import { buildTerminalMessage } from '../src/terminal-message.js';

test('records real SSE history in arrival sequence and deduplicates replayed events', () => {
  workflowTraceStore.reset();
  const runId = `run-${randomUUID()}`;
  const first = {
    eventId: `event-${randomUUID()}`,
    sequence: 9,
    runId,
    processor: `Processor-${randomUUID()}`,
    state: 'RUNNING',
    timestamp: new Date().toISOString(),
  };
  const second = {
    eventId: `event-${randomUUID()}`,
    sequence: 10,
    runId,
    processor: `Processor-${randomUUID()}`,
    state: 'COMPLETE',
    result: 'PASSED',
    artifactId: `artifact-${randomUUID()}`,
    message: `message-${randomUUID()}`,
    timestamp: new Date().toISOString(),
  };

  workflowTraceStore.record(second);
  workflowTraceStore.record(first);
  workflowTraceStore.record(second);

  assert.deepEqual(
    workflowTraceStore.getSnapshot().map((entry) => entry.eventId),
    [first.eventId, second.eventId],
  );
  assert.deepEqual(
    workflowTraceStore.getSnapshot().map((entry) => entry.sequence),
    [9, 10],
  );
});

test('panel renders real events and keeps completed rows inspectable as new events arrive', () => {
  workflowTraceStore.reset();
  const runId = `run-${randomUUID()}`;
  const container = { innerHTML: '' };
  const panel = createWorkflowTracePanel(container);

  const completed = {
    eventId: `event-${randomUUID()}`,
    sequence: 1,
    runId,
    processor: 'SchemaValidation',
    state: 'COMPLETE',
    result: 'VALID',
    artifactId: `artifact-${randomUUID()}`,
    timestamp: new Date().toISOString(),
  };
  workflowTraceStore.record(completed);
  panel.render();
  assert.match(container.innerHTML, /SchemaValidation/);
  assert.match(container.innerHTML, /VALID/);
  assert.match(container.innerHTML, new RegExp(completed.artifactId));

  const later = {
    eventId: `event-${randomUUID()}`,
    sequence: 2,
    runId,
    processor: 'Builder',
    state: 'RUNNING',
    timestamp: new Date().toISOString(),
  };
  workflowTraceStore.record(later);
  assert.match(container.innerHTML, /SchemaValidation/, 'completed row disappeared');
  assert.match(container.innerHTML, /Builder/);
  assert.match(container.innerHTML, /Canonical execution trace \(2\)/);
});

test('terminal enrichment stores concrete persisted artifact values on the Done event', () => {
  workflowTraceStore.reset();
  const runId = `run-${randomUUID()}`;
  const doneEventId = `event-${randomUUID()}`;
  const createdHash = `sha256:${randomUUID().replaceAll('-', '')}`;
  workflowTraceStore.record({
    eventId: doneEventId,
    sequence: 3,
    runId,
    processor: 'Done',
    state: 'COMPLETE',
    result: 'PASSED',
    timestamp: new Date().toISOString(),
  });
  workflowTraceStore.enrich(doneEventId, {
    hashProof: { created_hash: createdHash, recomputed_hash: createdHash, equal: true },
  });

  const trace = workflowTraceStore.getSnapshot();
  assert.equal(trace.length, 1);
  assert.deepEqual(trace[0].details, {
    hashProof: { created_hash: createdHash, recomputed_hash: createdHash, equal: true },
  });
});

test('terminal chat message shows the exact persisted Builder output and runtime proof values', () => {
  const runId = `run-${randomUUID()}`;
  const finalOutput = JSON.stringify({
    kind: `generated-${randomUUID()}`,
    evidence: `runtime-${randomUUID()}`,
  });
  const createdHash = `sha256:${randomUUID().replaceAll('-', '')}`;
  const builderExecutionId = `execution-${randomUUID()}`;
  const message = buildTerminalMessage({
    runId,
    processor: 'Done',
    result: 'PASSED',
    builderResult: {
      result: 'PASSED',
      final_output: finalOutput,
      evidence: {
        execution_id: builderExecutionId,
        exit_codes: [0, 0, 0],
        file_changes: [],
        bytes_written: 0,
      },
    },
    hashProof: { created_hash: createdHash, recomputed_hash: createdHash, equal: true },
    tripleValidation: { schema_result: 'VALID', fixture_result: 'VALID', goal_result: 'VALID' },
  });

  assert.ok(message.includes(finalOutput), 'generated output missing from chat message');
  assert.ok(message.includes(`created_hash=${createdHash}`));
  assert.ok(message.includes(`recomputed_hash=${createdHash}`));
  assert.ok(message.includes('equal=true'));
  assert.ok(message.includes(`builder_execution_id=${builderExecutionId}`));
  assert.ok(message.includes('schema_validation=VALID'));
  assert.ok(!message.includes('Cryptographic Hash (SHA-256): `verified`'), 'synthesized proof value leaked');
});

test('terminal chat message falls back explicitly when final_output is unavailable', () => {
  const message = buildTerminalMessage({
    runId: `run-${randomUUID()}`,
    processor: 'Done',
    result: 'PASSED',
    builderResult: { result: 'PASSED', final_output: null, evidence: {} },
    hashProof: null,
    tripleValidation: null,
  });
  assert.ok(message.includes('[Builder final_output was not available in the persisted runtime artifact]'));
  assert.ok(message.includes('created_hash=NOT_AVAILABLE'));
  assert.ok(message.includes('equal=NOT_AVAILABLE'));
});

test('non-passed terminal results never produce a success chat message', () => {
  const message = buildTerminalMessage({
    runId: `run-${randomUUID()}`,
    processor: 'Done',
    result: 'ROOT_CAUSE',
    builderResult: null,
    hashProof: null,
    tripleValidation: null,
  });
  assert.equal(message, null);
});
