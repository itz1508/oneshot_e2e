import test from 'node:test';
import assert from 'node:assert/strict';
import { stageLabel } from '../src/console-interactions.js';
test('canonical processors map to readable stages without replacing unknown processors', () => {
  assert.equal(stageLabel('GapAnalysis'), 'Gap Analysis');
  assert.equal(stageLabel('PlanReview'), 'Research Review');
  assert.equal(stageLabel('Hash'), 'Hash Verification');
  assert.equal(stageLabel('UnknownProcessor'), 'UnknownProcessor');
});
