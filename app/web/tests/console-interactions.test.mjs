import test from 'node:test';
import assert from 'node:assert/strict';
import { stageLabel, reviewEditsFromForm } from '../src/console-interactions.js';
import { providerRowHTML } from '../src/providers-panel.js';

test('canonical processors map to readable stages without replacing unknown processors', () => {
  assert.equal(stageLabel('GapAnalysis'), 'Gap Analysis');
  assert.equal(stageLabel('PlanReview'), 'Plan review');
  assert.equal(stageLabel('Hash'), 'Hash Verification');
  assert.equal(stageLabel('ProviderBinding'), 'ProviderBinding');
});

test('review form preserves canonical task and requirement IDs while sending edited text', () => {
  const values = { '[data-objective]': ' New objective ', '[data-requirement="0"]': ' A changed requirement ', '[data-step="0"]': ' A changed task ' };
  const form = { querySelector: selector => ({ value: values[selector] }) };
  const review = { edits: { requirements: [{ id: 'req:7' }], steps: [{ id: 'step:9' }] } };
  const notes = ['Additional user context'];
  const edits = reviewEditsFromForm(form, review, notes);
  assert.deepEqual(edits, { objective: 'New objective', requirements: [{ id: 'req:7', statement: 'A changed requirement' }], steps: [{ id: 'step:9', description: 'A changed task' }], notes });
  edits.notes.push('New note');
  assert.equal(notes.length, 1);
});

test('provider UI escapes model metadata and leaves API keys empty', () => {
  const html = providerRowHTML({ id: 'openai', displayName: 'OpenAI', runtime: { model: '\"><script>bad()</script>', apiBase: 'https://example.com' }, credentialType: 'api_key', configured: true, credentialSource: 'local-secret-store' }, 'openai');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /data-key type="password"/);
  assert.match(html, /data-base-url/);
  assert.match(html, /Remove Key/);
  assert.ok(!/data-key[^>]*value=/.test(html));
});
