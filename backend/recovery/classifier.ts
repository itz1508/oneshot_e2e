import {
  classify,
  type FailureCategory,
  type RawFailureInput,
} from "./types.js";

/**
 * Classify a raw failure input into the normalized Phase 5 taxonomy.
 *
 * Provider failures from Phase 4A/4B carry an explicit normalized category in
 * `providerStatus.category` — that hint wins so Phase 4 categories map into
 * the taxonomy WITHOUT creating duplicates. Otherwise structured context wins
 * over free text: sandbox/build/validation context produces the workflow
 * categories, and only remaining text-shaped failures fall through to the
 * provider text rules and finally WORKFLOW_INTERNAL_FAILURE.
 */
export function classifyFailure(input: RawFailureInput): FailureCategory {
  if (input.category) return input.category;

  // Explicit Phase 4A/4B normalized provider category hint.
  const hint = input.providerStatus?.category;
  if (typeof hint === "string" && hint) {
    if (/^PROVIDER_(AUTH|MODEL|NETWORK|CONFIGURATION)_FAILURE$/.test(hint)) {
      return hint as FailureCategory;
    }
    // PROVIDER_INTERNAL_FAILURE and unknown provider hints stay inside the
    // provider family without inventing a new taxonomy entry.
    if (/^PROVIDER_.*_FAILURE$/.test(hint)) {
      return "PROVIDER_CONFIGURATION_FAILURE";
    }
    // Non-provider hints (e.g. a literal taxonomy word inside the message)
    // fall through to normal classification below.
  }

  // Structured context wins over message text.
  const sbx = input.sandbox;
  if (sbx) {
    const codes = sbx.exitCodes ?? [];
    if (sbx.timedOut) return "SANDBOX_EXECUTION_FAILURE";
    if (codes.some((c) => c !== 0)) {
      const compiler = input.build?.compilerLine ?? sbx.firstStderrLine ?? "";
      if (/\bcompiler?\b|\bbuild\b|syntaxerror|\bcannot find module\b/i.test(compiler)) {
        return "BUILD_FAILURE";
      }
      return "SANDBOX_EXECUTION_FAILURE";
    }
    if (input.build?.compilerLine) return "BUILD_FAILURE";
  }
  if (input.build?.compilerLine) return "BUILD_FAILURE";
  if (input.validation) return "VALIDATION_FAILURE";
  if (input.hashVerified === false) return "SANDBOX_EXECUTION_FAILURE";

  return classify(input.message) ?? "WORKFLOW_INTERNAL_FAILURE";
}