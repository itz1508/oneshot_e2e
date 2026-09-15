import type { AgentRuntime, NormalizedResult, RuntimeInvocation } from "./types.js";
import { createOpenAICompatibleClient } from "../transport/openai-compatible-client.js";
import type { StructuredResearchDraft } from "../../agents/researcher/structured-draft.js";
import type { CredentialResolver } from "../../security/credential-resolver.js";
import { CredentialError } from "../../security/credential-reference.js";

function isProduction(override?: boolean): boolean {
  if (override !== undefined) return override;
  return String(process.env.ONESHOT_MODE || "").toLowerCase() === "production";
}

export interface DirectOpenAIRuntimeOptions {
  /**
   * Credential resolver service (M11). When set, `invocation.credentialRef` is
   * resolved at invoke() time only; the runtime stays credential-neutral (no
   * permanently bound reference).
   */
  readonly credentialResolver?: CredentialResolver;
  /**
   * @deprecated Legacy bridge (correction #8). Internal regression
   * compatibility only. NOT accepted from HTTP input. Disabled in production.
   * Does not bypass redaction. Removed at the M13+ milestone once callers pass
   * equivalent tests through the resolver path.
   */
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  /** Override production detection for tests. */
  readonly productionMode?: boolean;
}

/**
 * Direct OpenAI-compatible runtime (M10). Consumes the SAME
 * `ResolvedExecutionRoute` as the Strands adapter (M9) but invokes the
 * endpoint directly via the undici-free `OpenAICompatibleClient` (node:http),
 * with no Strands SDK. The route is non-secret; credentials are supplied by
 * reference (separately). No credential leakage in logs.
 *
 * The direct runtime has no tools of its own (no tool-use); the deterministic
 * router (M7) only routes here when the workflow's required capabilities can be
 * satisfied without tool-use, or when tool-use evidence is already established.
 */
export class DirectOpenAIRuntime implements AgentRuntime {
  readonly runtimeId = "direct-openai";

  constructor(private readonly opts: DirectOpenAIRuntimeOptions = {}) {
    if (this.opts.apiKey !== undefined && isProduction(this.opts.productionMode)) {
      throw new CredentialError(
        "CREDENTIAL_DENIED",
        "legacy apiKey bridge is disabled in production; use CredentialReference + CredentialResolver",
      );
    }
  }

  async invoke(invocation: RuntimeInvocation): Promise<NormalizedResult> {
    const client = createOpenAICompatibleClient();
    const { route, promptText, systemPrompt } = invocation;
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: promptText });

    let apiKey = this.opts.apiKey;
    if (this.opts.credentialResolver && invocation.credentialRef) {
      apiKey = await this.opts.credentialResolver.resolve(invocation.credentialRef);
    }
    const result = await client.chat({
      baseUrl: route.baseUrl,
      modelId: route.modelId,
      apiKey,
      messages,
      timeoutMs: this.opts.timeoutMs,
    });

    return {
      routeId: route.routeId,
      workflowId: route.workflowId,
      content: result.content,
      structured: tryParseDraft(result.content),
      evidence: [],
      finishReason: normalizeFinish(result.finishReason),
    };
  }
}

function normalizeFinish(reason: string): "stop" | "length" | "tool-call" | "error" {
  if (reason === "length") return "length";
  if (reason === "tool_calls" || reason === "tool-call") return "tool-call";
  return "stop";
}

function tryParseDraft(text: string): StructuredResearchDraft | undefined {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }
  try {
    const parsed = JSON.parse(t) as StructuredResearchDraft;
    if (parsed && typeof parsed === "object" && "summary" in parsed) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
