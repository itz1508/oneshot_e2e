/**
 * OneShot research policy (M12).
 *
 * Tavily is ONE external research adapter. `local-only` and `hybrid` are
 * OneShot POLICIES over workspace evidence — there is deliberately no
 * "Tavily local mode" and no separate "Tavily hybrid adapter". The policy
 * decides whether an external research adapter may be invoked at all; the
 * adapter's own configuration (`ONESHOT_TAVILY_MODE`) decides which
 * operations run once the policy allows it.
 *
 * This module is external-call-free and carries no credentials.
 */
import type { ResearchMode } from "../core/policy.js";

export type { ResearchMode };

/** Canonical evidence provenance vocabulary (M12). */
export const EvidenceProvenance = {
  USER_PROMPT: "user-prompt",
  USER_PROMPT_CONTEXT: "user-prompt-context",
  WORKSPACE_FILE: "workspace-file",
  TAVILY_SEARCH: "tavily-search",
  TAVILY_EXTRACT: "tavily-extract",
  TAVILY_RESEARCH_STREAM: "tavily-research-stream",
  PROVIDER_SYNTHESIS: "provider-synthesis",
  RESEARCH_POLICY: "oneshot-research-policy",
} as const;

/** Tavily provenance prefix shared by every Tavily-produced evidence item. */
export const TAVILY_PROVENANCE_PREFIX = "tavily-";

export type ResearchPolicyErrorCode =
  | "RESEARCH_EXTERNAL_UNAVAILABLE"
  | "RESEARCH_POLICY_DENIED"
  | "RESEARCH_ASSERTION_UNSATISFIED";

export class ResearchPolicyError extends Error {
  readonly code: ResearchPolicyErrorCode;
  constructor(code: ResearchPolicyErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ResearchPolicyError";
    this.code = code;
  }
}

export interface ResearchPolicyDecision {
  readonly mode: ResearchMode;
  /** Whether an external research adapter may be invoked at all. */
  readonly externalAllowed: boolean;
  /** True when the mode REQUIRES a configured external adapter. */
  readonly externalRequired: boolean;
  readonly reason: string;
}

/**
 * Decide whether external research may run. Fails CLOSED: `external` mode
 * without a configured adapter throws `RESEARCH_EXTERNAL_UNAVAILABLE`.
 * `hybrid` degrades gracefully to workspace evidence when the adapter is not
 * configured (the decision records that), because hybrid = workspace PLUS
 * configured external — an unconfigured adapter removes only the external leg.
 */
export function decideResearchPolicy(input: {
  requested: ResearchMode;
  /** Whether an external research adapter is configured (e.g. Tavily key). */
  externalConfigured: boolean;
}): ResearchPolicyDecision {
  const { requested, externalConfigured } = input;
  switch (requested) {
    case "disabled":
      return {
        mode: "disabled",
        externalAllowed: false,
        externalRequired: false,
        reason: "research disabled by policy",
      };
    case "local-only":
      return {
        mode: "local-only",
        externalAllowed: false,
        externalRequired: false,
        reason:
          "local-only policy: workspace evidence only; no external adapter is invoked",
      };
    case "external":
      if (!externalConfigured) {
        throw new ResearchPolicyError(
          "RESEARCH_EXTERNAL_UNAVAILABLE",
          "external research mode requires a configured external adapter, but none is available",
        );
      }
      return {
        mode: "external",
        externalAllowed: true,
        externalRequired: true,
        reason: "external policy: configured external adapter only",
      };
    case "hybrid":
      if (!externalConfigured) {
        return {
          mode: "hybrid",
          externalAllowed: false,
          externalRequired: false,
          reason:
            "hybrid policy: external adapter not configured; workspace evidence only",
        };
      }
      return {
        mode: "hybrid",
        externalAllowed: true,
        externalRequired: false,
        reason: "hybrid policy: workspace evidence plus configured external adapter",
      };
    default: {
      const exhaustive: never = requested;
      throw new ResearchPolicyError(
        "RESEARCH_POLICY_DENIED",
        `unsupported research mode: ${String(exhaustive)}`,
      );
    }
  }
}

/**
 * Resolve the REQUESTED research mode from configuration. Centralizes the
 * previously inline `process.env.TAVILY_API_KEY` read (M11/M12 finding) so no
 * caller inspects the environment directly. Behavior is preserved: an
 * explicit `ONESHOT_RESEARCH_MODE` wins; otherwise the mode is derived from
 * Tavily availability exactly as before M12.
 */
export function resolveRequestedResearchMode(): ResearchMode {
  const configured = (process.env.ONESHOT_RESEARCH_MODE || "").trim();
  if (
    configured === "disabled" ||
    configured === "local-only" ||
    configured === "external" ||
    configured === "hybrid"
  ) {
    return configured;
  }
  const hasTavily = Boolean((process.env.TAVILY_API_KEY || "").trim());
  return hasTavily ? "external" : "disabled";
}

/**
 * A Tavily assertion can only be satisfied by Tavily-produced evidence.
 * Prompt-only evidence (`user-prompt`, `user-prompt-context`) and workspace
 * evidence (`workspace-file`) can NEVER satisfy it, no matter how the prompt
 * is phrased. Throws `RESEARCH_ASSERTION_UNSATISFIED` otherwise.
 */
export function assertTavilyEvidence(
  evidence: readonly { provenance: string }[],
  label = "tavily",
): void {
  const satisfied = evidence.some((item) =>
    (item.provenance || "").startsWith(TAVILY_PROVENANCE_PREFIX),
  );
  if (!satisfied) {
    throw new ResearchPolicyError(
      "RESEARCH_ASSERTION_UNSATISFIED",
      `a '${label}' assertion requires evidence with provenance prefixed by '${TAVILY_PROVENANCE_PREFIX}', but no such evidence exists`,
    );
  }
}
