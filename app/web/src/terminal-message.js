/**
 * terminal-message — build the main user-facing chat message for a terminal
 * run event from persisted runtime artifacts only (fixture
 * 03-generated-output-chat). The primary content is the provider-generated
 * Builder output; proof lines carry concrete runtime evidence values
 * (fixture 02-runtime-evidence-values). Values are never synthesized.
 */
export function buildTerminalMessage({
  runId,
  processor,
  result,
  builderResult,
  hashProof,
  tripleValidation,
}) {
  if (result !== 'PASSED') return null;
  const finalOutput = typeof builderResult?.final_output === 'string'
    ? builderResult.final_output
    : '';
  const evidence = builderResult?.evidence;
  const proofLines = [
    `run_id=${runId}`,
    `builder_execution_id=${evidence?.execution_id ?? 'NOT_AVAILABLE'}`,
    `builder_exit_codes=${JSON.stringify(evidence?.exit_codes ?? [])}`,
    `builder_files_changed=${JSON.stringify(evidence?.file_changes ?? [])}`,
    `builder_bytes_written=${evidence?.bytes_written ?? 'NOT_AVAILABLE'}`,
    `created_hash=${hashProof?.created_hash ?? 'NOT_AVAILABLE'}`,
    `recomputed_hash=${hashProof?.recomputed_hash ?? 'NOT_AVAILABLE'}`,
    `equal=${hashProof?.equal ?? 'NOT_AVAILABLE'}`,
    `schema_validation=${tripleValidation?.schema?.result ?? tripleValidation?.schema_result ?? 'NOT_AVAILABLE'}`,
    `fixture_validation=${tripleValidation?.fixture?.result ?? tripleValidation?.fixture_result ?? 'NOT_AVAILABLE'}`,
    `goal_validation=${tripleValidation?.goal?.result ?? tripleValidation?.goal_result ?? 'NOT_AVAILABLE'}`,
    `terminal_processor=${processor}`,
    `workflow_result=${result}`,
  ];
  return [
    finalOutput || '[Builder final_output was not available in the persisted runtime artifact]',
    '',
    '---',
    ...proofLines,
  ].join('\n');
}