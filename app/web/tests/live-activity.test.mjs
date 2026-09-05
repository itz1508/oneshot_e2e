import test from 'node:test';
import assert from 'node:assert/strict';
import { actionTextFromEvent, artifactRowFromEvent, rowsFromSnapshot } from '../src/live-activity.js';
import { planToGroups } from '../src/task-management.js';

test('observable action text prefers producer-declared activity', () => {
  assert.equal(actionTextFromEvent({ activity: 'Opening LangChain tracing reference...', processor: 'Researcher', state: 'RUNNING' }), 'Opening LangChain tracing reference...');
});

test('action text falls back to the real processor + state transition only', () => {
  assert.equal(actionTextFromEvent({ processor: 'Planner', state: 'RUNNING' }), 'Planner running');
  assert.equal(actionTextFromEvent({ processor: 'Gap Analysis', state: 'PENDING' }), 'Gap Analysis pending');
  assert.equal(actionTextFromEvent(null), '');
});

test('artifact rows require a real artifact object; no inferred labels', () => {
  assert.equal(artifactRowFromEvent({ processor: 'Builder', state: 'RUNNING', artifact_id: 'abc' }), null);
  assert.equal(artifactRowFromEvent({ artifact: { name: 'plan.researcher' } }).operation, null);
  const row = artifactRowFromEvent({ artifact: { name: 'plan.gap', path: 'data/runs/r1/plan.gap.json', operation: 'UPDATE', kind: 'RECORD' } });
  assert.equal(row.operation, 'UPDATE');
  assert.equal(row.kind, 'RECORD');
});

test('snapshot artifacts become real name+path rows without invented operations', () => {
  const rows = rowsFromSnapshot({ prompt: 'data/runs/r1/prompt.json', plan: 'data/runs/r1/plan.researcher.json' });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { name: 'prompt', path: 'data/runs/r1/prompt.json', operation: null, kind: null, source: 'snapshot' });
  assert.deepEqual(rowsFromSnapshot(null), []);
  assert.deepEqual(rowsFromSnapshot({}), []);
});

test('activity and TODO content never mix (surface separation guard)', () => {
  const event = { activity: 'Opening reference screen', processor: 'Researcher', state: 'RUNNING', steps: [{ step_id: 'a', description: 'Genuine plan step', responsibility: 'Planner' }] };
  assert.equal(actionTextFromEvent(event), 'Opening reference screen');
  const groups = planToGroups(event);
  const flat = groups.flatMap(g => g.items.map(i => i.description));
  assert.ok(flat.every(d => d !== 'Opening reference screen'), 'activity text must never appear as a TODO description');
  assert.deepEqual(flat, ['Genuine plan step']);
});
