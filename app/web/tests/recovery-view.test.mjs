// Phase 5 — user-facing recovery card (concise root cause, no traces/secrets).
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryCard, recoveryStatusLabel } from '../src/recovery-view.js';

const recovery = {
  run_id: 'run-1',
  state: 'RECOMMENDATION_READY',
  failure_category: 'PROVIDER_AUTH_FAILURE',
  failed_stage: 'ProviderBinding',
  result: {
    category: 'PROVIDER_AUTH_FAILURE',
    stage: 'ProviderBinding',
    summary: 'sum',
    rootCause: 'The provider rejected the configured credential (BYOK).',
    evidenceIds: ['ev:1', 'ev:2'],
    recommendation: 'Verify the credential in Provider settings, save, then retry.',
    retryable: false,
  },
  evidence: [],
  retry: { allowed: false, attempts: 0, max_attempts: 3, policy_reason: 'blocked' },
  research_escalations: [],
  updated_at: '2026-01-01T00:00:00.000Z',
  provider: { id: 'featherless' },
};

test('main UI shows concise root cause and recommendation', () => {
  const html = recoveryCard(recovery);
  assert.match(html, /Failure detected/);
  assert.match(html, /What failed: ProviderBinding \(PROVIDER_AUTH_FAILURE\)/);
  assert.match(html, /Why: The provider rejected the configured credential/);
  assert.match(html, /Recommended fix: Verify the credential in Provider settings/);
  assert.match(html, /Status: Needs configuration change/);
});

test('UI card contains no raw JSON, traces, evidence dumps, or secrets', () => {
  const dirty = {
    ...recovery,
    evidence: [{ evidence_id: 'ev:9', source: 'sandbox:stderr', statement: 'RAW STACK at Builder.run workflow.ts:41', provenance: 'p' }],
  };
  const html = recoveryCard(dirty);
  assert.ok(!html.includes('RAW STACK'), 'no evidence dumps in main workspace');
  assert.ok(!html.includes('evidence_id'), 'no raw JSON fields in main workspace');
  assert.ok(!html.includes('{'), 'no JSON braces in the card');
});

test('recovery status label reflects research escalation and retryability', () => {
  assert.equal(recoveryStatusLabel(recovery), 'Needs configuration change');
  assert.equal(
    recoveryStatusLabel({
      ...recovery,
      failure_category: 'PROVIDER_NETWORK_FAILURE',
      retry: { allowed: true, attempts: 0, max_attempts: 3 },
    }),
    'Ready to retry',
  );
  assert.equal(
    recoveryStatusLabel({
      ...recovery,
      failure_category: 'SANDBOX_EXECUTION_FAILURE',
      research_escalations: [{ sources: ['local'] }],
    }),
    'Additional research performed',
  );
  assert.equal(
    recoveryStatusLabel({
      ...recovery,
      failure_category: 'WORKFLOW_INTERNAL_FAILURE',
    }),
    'Manual review required',
  );
});