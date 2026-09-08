import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowTraceStore } from '../src/workflow-trace.js';
import { createWorkflowTracePanel } from '../src/workflow-trace-panel.js';
import { buildTerminalMessage } from '../src/terminal-message.js';
import { createTaskManagement } from '../src/task-management.js';

test('trace keeps completed events, orders replay, deduplicates and escapes payloads', () => {
  workflowTraceStore.reset();
  const container = { innerHTML: '' };
  createWorkflowTracePanel(container);
  const first = { eventId: 'e1', sequence: 1, runId: 'run1', processor: 'Researcher', state: 'Completed', timestamp: 'now', message: '<script>payload</script>' };
  const second = { ...first, eventId: 'e2', sequence: 2, processor: 'Builder', state: 'Running' };
  workflowTraceStore.record(second);
  workflowTraceStore.record(first);
  workflowTraceStore.record(first);
  assert.deepEqual(workflowTraceStore.getSnapshot().map(e => e.eventId), ['e1', 'e2']);
  assert.match(container.innerHTML, /Researcher/);
  assert.match(container.innerHTML, /Completed/);
  assert.match(container.innerHTML, /&lt;script&gt;/);
  assert.ok(!container.innerHTML.includes('<script>'));
  workflowTraceStore.reset();
  assert.equal(container.innerHTML, '');
});

test('chat output requires matching workflow and sandbox proof, never fabricates content', () => {
  const input = { result: 'Passed', builderResult: { result: 'Passed', hash_matched: true, hash_sandbox: 'hash1', final_output: 'Provider-authored document' }, hashProof: { created_hash: 'hash1', recomputed_hash: 'hash1', equal: true } };
  assert.equal(buildTerminalMessage(input), 'Provider-authored document');
  assert.equal(buildTerminalMessage({ ...input, result: 'Failed' }), null);
  assert.equal(buildTerminalMessage({ ...input, hashProof: { ...input.hashProof, equal: false } }), null);
  assert.equal(buildTerminalMessage({ ...input, builderResult: { ...input.builderResult, hash_sandbox: 'different' } }), null);
  assert.equal(buildTerminalMessage({ ...input, builderResult: { ...input.builderResult, final_output: null } }), null);
});

test('task management waiting state renders authorization message', () => {
  const previous = globalThis.document;
  const extras = { textContent: '', append(child) { this.textContent = child.textContent; } };
  globalThis.document = {
    querySelector: sel => sel === '#task-plan-extras' ? extras : null,
    querySelectorAll: () => [],
    createElement: () => ({ textContent: '', className: '' }),
  };
  try {
    const tasks = createTaskManagement();
    tasks.setWaiting('Research Review');
    assert.equal(extras.textContent, 'Waiting for Research Review decision. The runtime will continue after your authorization.');
    tasks.setWaiting('Build Ready');
    assert.equal(extras.textContent, 'Waiting for Build Ready decision. The runtime will continue after your authorization.');
  } finally { globalThis.document = previous; }
});

