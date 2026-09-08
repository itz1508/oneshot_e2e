import test from 'node:test';
import assert from 'node:assert/strict';
import { stageLabel } from '../src/console-interactions.js';
import { providerRowHTML } from '../src/providers-panel.js';

test('canonical processors map to readable stages without replacing unknown processors', () => {
  assert.equal(stageLabel('GapAnalysis'), 'Gap Analysis');
  assert.equal(stageLabel('PlanReview'), 'Research Review');
  assert.equal(stageLabel('Hash'), 'Hash Verification');
  assert.equal(stageLabel('ProviderBinding'), 'ProviderBinding');
});

test('provider UI escapes model metadata and leaves API keys empty', () => {
  const html = providerRowHTML({ id: 'openai', displayName: 'OpenAI', runtime: { model: '\"><script>bad()</script>', apiBase: 'https://example.com' }, credentialType: 'api_key', configured: true, credentialSource: 'local-secret-store' }, 'openai');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /data-key type="password"/);
  assert.match(html, /data-base-url/);
  assert.match(html, /Remove Key/);
  assert.ok(!/data-key[^>]*value=/.test(html));
});
