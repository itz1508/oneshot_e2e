import type { AgentRuntime, NormalizedResult, RuntimeInvocation } from "./types.js";
import type { ResolvedExecutionRoute } from "../core/route.js";
import { createStrandsOpenAIModel } from "./strands-openai-model.js";
import {
  createEvidenceRecorder,
  type FactListener,
  type ResearchEvidenceRecorder,
} from "../../agents/researcher/strands-tools.js";
import { StrandsResearcherAgent } from "../../agents/researcher/strands-researcher-agent.js";
import type { OpenAIModel } from "../../../app/integration/strands/src/index.js";
import type { StructuredResearchDraft } from "../../agents/researcher/structured-draft.js";
import type { CredentialResolver } from "../../security/credential-resolver.js";
import { CredentialError } from "../../security/credential-reference.js";

function isProduction(override?: boolean): boolean {
  if (override !== undefined) return override;
  return String(process.env.ONESHOT_MODE || "").toLowerCase() === "production";
}

export interface StrandsAgentRunner {
  runResearch(promptText: string): Promise<StructuredResearchDraft>;
}
export type StrandsAgentFactory = (
  model: OpenAIModel,
  projectRoot: string,
  tavilyKey: string | undefined,
  onFact: FactListener | undefined,
  recorder?: ResearchEvidenceRecorder,
) => StrandsAgentRunner;
export type StrandsModelFactory = (
  route: ResolvedExecutionRoute,
  apiKey?: string,
) => OpenAIModel;

export interface StrandsAdapterOptions {
  readonly projectRoot: string;
  /** @deprecated Legacy bridge (correction #8). Internal regression only, production-disabled. */
  readonly tavilyKey?: string;
  /** @deprecated Legacy bridge (correction #8). Internal regression only, production-disabled. */
  readonly apiKey?: string;
  /** Credential resolver service (M11); resolves invocation.credentialRef at invoke() time. */
  readonly credentialResolver?: CredentialResolver;
  readonly onFact?: FactListener;
  /** Inject a custom agent factory (tests use a fake to avoid the real SDK + network). */
  readonly createAgent?: StrandsAgentFactory;
  /** Inject a custom model factory. */
  readonly createModel?: StrandsModelFactory;
  /** Override production detection for tests. */
  readonly productionMode?: boolean;
}

/**
 * Strands adapter (M9). Implements `AgentRuntime`: consumes a non-secret
 * `ResolvedExecutionRoute` + invocation, builds a Strands `OpenAIModel` from
 * the route (credentials supplied separately), runs the Strands Researcher
 * agent, and returns a `NormalizedResult` carrying the structured draft and
 * recorded evidence. The adapter receives the route, not credentials.
 */
export class StrandsAdapter implements AgentRuntime {
  readonly runtimeId = "strands";

  constructor(private readonly opts: StrandsAdapterOptions) {
    const hasLegacyKey =
      this.opts.apiKey !== undefined || this.opts.tavilyKey !== undefined;
    if (hasLegacyKey && isProduction(this.opts.productionMode)) {
      throw new CredentialError(
        "CREDENTIAL_DENIED",
        "legacy apiKey/tavilyKey bridges are disabled in production; use CredentialReference + CredentialResolver",
      );
    }
  }

  async invoke(invocation: RuntimeInvocation): Promise<NormalizedResult> {
    const createAgent = this.opts.createAgent ?? defaultCreateAgent;
    const createModel = this.opts.createModel ?? createStrandsOpenAIModel;
    let apiKey = this.opts.apiKey;
    if (this.opts.credentialResolver && invocation.credentialRef) {
      apiKey = await this.opts.credentialResolver.resolve(invocation.credentialRef);
    }
    const model = createModel(invocation.route, apiKey);
    const recorder = createEvidenceRecorder();
    const agent = createAgent(
      model,
      this.opts.projectRoot,
      this.opts.tavilyKey,
      this.opts.onFact,
      recorder,
    );
    const draft = await agent.runResearch(invocation.promptText);
    return {
      routeId: invocation.route.routeId,
      workflowId: invocation.route.workflowId,
      content: JSON.stringify(draft),
      structured: draft,
      evidence: recorder
        .list()
        .map((e) => ({
          source: e.source,
          statement: e.statement,
          provenance: e.provenance,
        })),
      finishReason: "stop",
    };
  }
}

const defaultCreateAgent: StrandsAgentFactory = (
  model,
  projectRoot,
  tavilyKey,
  onFact,
  recorder,
) => new StrandsResearcherAgent(model, projectRoot, tavilyKey, onFact, recorder);
