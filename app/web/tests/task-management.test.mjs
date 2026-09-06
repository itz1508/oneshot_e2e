import test from 'node:test';
import assert from 'node:assert/strict';
import { planToGroups, stepStateFromEvent, agentForResponsibility, agentOfStage } from '../src/task-management.js';

const PLAN = {
  plan_id: 'plan-1',
  revision: 2,
  steps: [
    { step_id: 's1', description: 'Inspect the current OneShot shell', responsibility: 'Researcher', depends_on: [], requirement_refs: [], goal_refs: [], fixture_refs: [], schema_refs: [] },
    { step_id: 's2', description: 'Compare two UI references', responsibility: 'Researcher', depends_on: ['s1'], requirement_refs: [], goal_refs: [], fixture_refs: [], schema_refs: [] },
    { step_id: 's3', description: 'Update styles.css tokens', responsibility: 'Builder', depends_on: ['s2'], requirement_refs: [], goal_refs: [], fixture_refs: [], schema_refs: [] },
  ],
};

test('TODO groups come exclusively from Plan steps, grouped by real responsibility', () => {
  const groups = planToGroups(PLAN);
  assert.deepEqual(groups.map(g => g.owner), ['Researcher', 'Builder']);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].items[0].description, 'Inspect the current OneShot shell');
  assert.equal(groups[0].items[0].stepId, 's1');
});

test('event activity is never converted into TODO items', () => {
  const polluted = {
    activity: 'Searching Mobbin for AI workspace references',
    processor: 'Researcher',
    state: 'RUNNING',
    steps: PLAN.steps,
  };
  const groups = planToGroups(polluted);
  const flat = groups.flatMap(g => g.items.map(i => i.description));
  assert.ok(!flat.some(d => d.includes('Mobbin')), 'activity text must not become a TODO');
});

test('steps without descriptions are dropped; empty plan yields no groups', () => {
  assert.deepEqual(planToGroups({ steps: [{ step_id: 'x', responsibility: 'Planner' }] }), []);
  assert.deepEqual(planToGroups({}), []);
  assert.deepEqual(planToGroups(null), []);
});

test('per-step state chips exist only for real step_id-scoped events', () => {
  assert.equal(stepStateFromEvent({ processor: 'Planner', state: 'Running' }), null);
  assert.deepEqual(stepStateFromEvent({ stepId: 's1', state: 'Running' }), { stepId: 's1', state: 'Running' });
  const chip = stepStateFromEvent({ stepId: 's1', state: 'Completed' });
  assert.deepEqual(chip, { stepId: 's1', state: 'Completed' });
  assert.deepEqual(stepStateFromEvent({ stepId: 's1', state: 'Failed' }), { stepId: 's1', state: 'Failed' });
  assert.equal(stepStateFromEvent({ stepId: 's1', state: 'RUNNING' }), null);
  assert.equal(stepStateFromEvent({ stepId: 's1', state: 'SOMETHING' }), null);
  assert.equal(stepStateFromEvent(null), null);
});

test('responsibility maps to canonical Agent groups; unknown owners stay separate', () => {
  assert.equal(agentForResponsibility('Researcher'), 'Researcher');
  assert.equal(agentForResponsibility('builder'), 'Builder');
  assert.equal(agentForResponsibility('Fixture Validation'), 'Triple Validation');
  assert.equal(agentForResponsibility('Frontend Engineer'), null);
  assert.equal(agentForResponsibility(''), null);
});

test('stage processors map to their Agent groups', () => {
  assert.equal(agentOfStage('Schema Validation'), 'Triple Validation');
  assert.equal(agentOfStage('Hash Verification'), 'Builder');
  assert.equal(agentOfStage('Researcher'), null);
  assert.equal(agentOfStage('Unknown'), null);
});
