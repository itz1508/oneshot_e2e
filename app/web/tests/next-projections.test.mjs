import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../lib/projections.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { verifiedResult, builderStarted, researchWaiting, editsFromBundle, eventNeedsSnapshot, mergeEvents, currentPhase, readiness, stageState } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const event = (processor, execution_status, sequence) => ({ processor, execution_status, sequence });
test('readiness is supplied by backend intent and human gates take precedence over Running', () => {
  assert.deepEqual(readiness(null, null, null, false, 'Connected'), { score: 0, label: 'Awaiting request' });
  assert.deepEqual(readiness(null, { intent: { ready_for_prompt: false } }, null, false, 'Connected'), { score: 0, label: 'Awaiting request' });
  assert.deepEqual(readiness(null, { intent: { ready_for_prompt: true } }, null, false, 'Connected'), { score: 3, label: 'Ready' });
  assert.equal(readiness({ pipeline_status: 'Running' }, null, null, true, 'Connected').label, 'Research Review');
  assert.equal(readiness({ pipeline_status: 'Running' }, null, { status: 'pending' }, false, 'Connected').label, 'Build Ready');
  assert.equal(readiness({ pipeline_status: 'Done', test_result: 'Failed' }, null, null, false, 'Connected').score, 0);
});
test('later processors and terminal success do not invent missing stage completions', () => {
  const run = { pipeline_status: 'Done', test_result: 'Passed', events: [event('Builder', 'Completed', 3)] };
  assert.equal(stageState(run, 'Planner'), undefined);
  assert.equal(stageState(run, 'Builder'), 'Completed');
  run.events.push(event('Builder', 'Failed', 4));
  assert.equal(stageState(run, 'Builder'), 'Failed');
});
test('terminal success requires matching nonempty hashes and terminal state', () => {
  const run = { pipeline_status: 'Done', test_result: 'Passed', hash_proof: { equal: true, created_hash: 'abc', recomputed_hash: 'abc' } };
  assert.equal(verifiedResult(run), true);
  for (const patch of [{ pipeline_status: 'Running' }, { test_result: 'Failed' }, { hash_proof: { equal: true, created_hash: 'a', recomputed_hash: 'b' } }, { hash_proof: { equal: true, created_hash: '', recomputed_hash: '' } }, { hash_proof: undefined }]) assert.equal(verifiedResult({ ...run, ...patch }), false);
});
test('Sandbox does not appear for running research or pending Builder', () => {
  assert.equal(builderStarted({ events: [event('Researcher', 'Running', 1), event('Builder', 'Pending', 2)] }), false);
  assert.equal(builderStarted({ events: [event('Builder', 'Running', 3)] }), true);
});
test('Research Again closes stale baseline until the next completion, and Planner closes review', () => {
  const run = { pipeline_status: 'Running', events: [event('Researcher', 'Completed', 1)] };
  assert.equal(researchWaiting(run), true);
  run.events.push(event('ResearchAgain', 'Completed', 2)); assert.equal(researchWaiting(run), false);
  run.events.push(event('Researcher', 'Running', 3)); assert.equal(researchWaiting(run), false);
  run.events.push(event('Researcher', 'Completed', 4)); assert.equal(researchWaiting(run), true);
  run.events.push(event('Planner', 'Running', 5)); assert.equal(researchWaiting(run), false);
});
test('Research edits retain canonical requirement and step IDs', () => {
  const bundle = { goal: { objective: 'Existing goal' }, plan: { requirements: [{ requirement_id: 'req-1', statement: 'Stock' }], steps: [{ step_id: 'step-1', description: 'List stock' }] } };
  const edits = editsFromBundle(bundle);
  assert.equal(edits.requirements[0].id, 'req-1'); assert.equal(edits.steps[0].id, 'step-1');
  edits.requirements[0].statement = 'Updated'; assert.equal(bundle.plan.requirements[0].statement, 'Stock');
});
test('ordinary events do not trigger API refetches and replay is deduplicated', () => {
  const a = { ...event('Planner', 'Running', 1), event_id: 'a', scope: 'WORKFLOW' };
  const b = { ...event('ChatMessage', 'Completed', 2), event_id: 'b', scope: 'SUPPORT' };
  assert.equal(eventNeedsSnapshot(a), false); assert.equal(eventNeedsSnapshot(b), false);
  assert.equal(eventNeedsSnapshot(event('BuildReady', 'Running', 3)), true);
  assert.deepEqual(mergeEvents([b, a], [a]), [a, b]);
  assert.equal(currentPhase({ current_processor: 'ChatMessage', events: [a, b] }), 'Preparing work');
});

test('canonical backend processor names map to visible stages', () => {
  const run = { events: [event('GapAnalysis', 'Completed', 1), event('TripleValidation', 'Completed', 2), event('Hash', 'Completed', 3)] };
  assert.equal(stageState(run, 'Gap Analysis'), 'Completed');
  assert.equal(stageState(run, 'Triple Validation'), 'Completed');
  assert.equal(stageState(run, 'Hash Verification'), 'Completed');
  assert.equal(stageState(run, 'Builder'), undefined);
});
