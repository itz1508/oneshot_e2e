import test from 'node:test';
import assert from 'node:assert/strict';
import { VISUAL_DEFAULTS, mergeVisual, hueTokenFor, STATE_NAMES, HUE_TOKENS } from '../src/visual-settings.js';

test('defaults cover the five semantic states with editable color channels', () => {
  assert.deepEqual(STATE_NAMES, ['IDLE', 'PLANNING', 'RUNNING', 'COMPLETE', 'ERROR']);
  for (const name of STATE_NAMES) {
    const c = VISUAL_DEFAULTS.stateColors[name];
    assert.match(c.primary, /^#[0-9a-fA-F]{6}$/);
    assert.match(c.secondary, /^#[0-9a-fA-F]{6}$/);
    assert.ok(c.ambientStrength >= 0 && c.ambientStrength <= 0.3);
  }
});

test('persisted settings override defaults; invalid values are rejected', () => {
  const merged = mergeVisual({
    effects: false,
    intensity: 'HIGH',
    stateColors: { RUNNING: { primary: '#123456' }, IDLE: { primary: 'not-a-color' } },
    hueMap: { Planner: 'unknown-hue' },
  });
  assert.equal(merged.effects, false);
  assert.equal(merged.intensity, 'HIGH');
  assert.equal(merged.stateColors.RUNNING.primary, '#123456');
  assert.equal(merged.stateColors.IDLE.primary, VISUAL_DEFAULTS.stateColors.IDLE.primary, 'invalid color rejected');
  assert.equal(merged.hueMap.Planner, VISUAL_DEFAULTS.hueMap.Planner, 'unknown hue rejected');
});

test('mergeVisual(null) returns pristine defaults', () => {
  const merged = mergeVisual(null);
  assert.deepEqual(merged, VISUAL_DEFAULTS);
});

test('Smart Hue is configurable and off means null token', () => {
  const on = { ...VISUAL_DEFAULTS, smartHue: true };
  const off = { ...VISUAL_DEFAULTS, smartHue: false };
  assert.equal(hueTokenFor(on, 'Researcher'), HUE_TOKENS.aqua);
  assert.equal(hueTokenFor(off, 'Researcher'), null);
  assert.equal(hueTokenFor(on, 'Not A Stage'), null);
});
