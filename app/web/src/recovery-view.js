// Phase 5 recovery — concise, user-facing failure view for the main workspace.
// Pure functions (no DOM) so node:test can verify them directly.
// The card renders ONLY normalized recovery data: no raw JSON, no traces,
// no evidence dumps, no secrets.

export function recoveryStatusLabel(rec) {
  if (!rec) return 'Manual review required';
  if (
    rec.state === 'RESEARCH_ESCALATION' ||
    (rec.research_escalations && rec.research_escalations.length > 0)
  ) {
    return 'Additional research performed';
  }
  if (
    rec.failure_category === 'PROVIDER_AUTH_FAILURE' ||
    rec.failure_category === 'PROVIDER_MODEL_FAILURE' ||
    rec.failure_category === 'PROVIDER_CONFIGURATION_FAILURE'
  ) {
    return 'Needs configuration change';
  }
  if (rec.retry && rec.retry.allowed) return 'Ready to retry';
  return 'Manual review required';
}

export function recoveryCard(rec) {
  if (!rec || !rec.result) return '';
  const r = rec.retry || { allowed: false, attempts: 0, max_attempts: 3 };
  return [
    '<section class="work-card recovery-card">',
    '<strong>Failure detected</strong>',
    `<div>What failed: ${rec.failed_stage} (${rec.failure_category})</div>`,
    `<div>Why: ${rec.result.rootCause}</div>`,
    `<div>Recommended fix: ${rec.result.recommendation}</div>`,
    `<div>Status: ${recoveryStatusLabel(rec)}</div>`,
    `<div>Retry: ${r.allowed ? 'allowed' : 'blocked'} (${r.attempts || 0}/${r.max_attempts || 3})</div>`,
    '</section>',
  ].join('');
}