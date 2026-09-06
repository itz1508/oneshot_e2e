// Only expose provider-authored output after both workflow and sandbox proof pass.
export function buildTerminalMessage({ result, builderResult, hashProof }) {
  if (result !== 'Passed' || builderResult?.result !== 'Passed' ||
      builderResult?.hash_matched !== true || hashProof?.equal !== true ||
      typeof hashProof.created_hash !== 'string' ||
      hashProof.created_hash !== hashProof.recomputed_hash ||
      builderResult.hash_sandbox !== hashProof.created_hash) return null;
  return typeof builderResult.final_output === 'string' && builderResult.final_output.trim()
    ? builderResult.final_output : null;
}
