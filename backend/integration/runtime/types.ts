import type { ResolvedExecutionRoute } from "../core/route.js";
import type { CredentialReference } from "../../security/credential-reference.js";

/** A single piece of normalized evidence produced by a runtime. */
export interface NormalizedEvidence {
  readonly source: string;
  readonly statement: string;
  readonly provenance: string;
}

/**
 * Normalized runtime result. The runtime returns this; OneShot validation
 * and transition (downstream) consume it. The runtime does NOT choose
 * transitions, persist canonical state, or approve its own output.
 */
export interface NormalizedResult {
  readonly routeId: string;
  readonly workflowId: string;
  readonly content: string;
  readonly structured?: unknown;
  readonly evidence: readonly NormalizedEvidence[];
  readonly finishReason: "stop" | "length" | "tool-call" | "error";
  readonly error?: string;
}

/**
 * What the runtime is asked to do. Carries the non-secret resolved route and
 * the prompt text. No credentials in the invocation; the runtime resolves
 * credentials by reference (M11) only when it actually needs them.
 */
export interface RuntimeInvocation {
  readonly route: ResolvedExecutionRoute;
  readonly promptText: string;
  readonly systemPrompt?: string;
  /**
   * Non-secret credential reference (M11). Resolved by the runtime's
   * CredentialResolver at invoke() time only. Travels PER invocation; a runtime
   * must NOT permanently bind one reference to a shared instance. Never enters
   * ResolvedExecutionRoute.
   */
  readonly credentialRef?: CredentialReference;
  /**
   * M15: AbortSignal for cancellation. When aborted, the runtime should
   * stop processing and return a cancelled result.
   */
  readonly signal?: AbortSignal;
}

/**
 * Agent runtime adapter contract (M4). A runtime consumes a resolved route +
 * invocation and returns a normalized result. It is strictly DOWNSTREAM of
 * routing: provider, endpoint, model, capability, and compatibility
 * resolution already happened before the runtime is invoked.
 */
export interface AgentRuntime {
  readonly runtimeId: string;
  invoke(invocation: RuntimeInvocation): Promise<NormalizedResult>;
}
