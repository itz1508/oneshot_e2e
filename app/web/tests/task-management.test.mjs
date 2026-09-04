import test from 'node:test';
import assert from 'node:assert/strict';
import { planToGroups, stepStateFromEvent, roleForResponsibility, roleOfStage } from '../src/task-management.js';

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
  assert.equal(stepStateFromEvent({ processor: 'Planner', state: 'RUNNING' }), null);
  assert.deepEqual(stepStateFromEvent({ stepId: 's1', state: 'RUNNING' }), { stepId: 's1', state: 'RUNNING' });
  const chip = stepStateFromEvent({ stepId: 's1', state: 'COMPLETED' });
  assert.deepEqual(chip, { stepId: 's1', state: 'COMPLETE' });
  assert.equal(stepStateFromEvent({ stepId: 's1', state: 'SOMETHING' }), null);
  assert.equal(stepStateFromEvent(null), null);
});

test('responsibility maps to canonical Role groups; unknown owners stay separate', () => {
  assert.equal(roleForResponsibility('Researcher'), 'Researcher');
  assert.equal(roleForResponsibility('builder'), 'Builder');
  assert.equal(roleForResponsibility('Fixture Validation'), 'Triple Validation');
  assert.equal(roleForResponsibility('Frontend Engineer'), null);
  assert.equal(roleForResponsibility(''), null);
});

test('stage processors map to their Role groups', () => {
  assert.equal(roleOfStage('Schema Validation'), 'Triple Validation');
  assert.equal(roleOfStage('Hash Verification'), 'Builder');
  assert.equal(roleOfStage('Researcher'), null);
  assert.equal(roleOfStage('Unknown'), null);
});
