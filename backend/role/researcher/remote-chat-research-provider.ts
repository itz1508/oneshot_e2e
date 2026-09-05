/**
 * RemoteChatResearchProvider — THE one canonical path from a normalized
 * ModelProvider into the OneShot Researcher boundary.
 *
 *   provider.generate() → normalized ModelResponse
 *     → shared fail-closed parseStructuredDraft (single authoritative parser)
 *     → shared structuredDraftToResearchBundle (canonical Researcher/Plan)
 *
 * Provider adapters know nothing about ResearchDraft/Plan/Builder; this
 * Researcher-boundary class is the only place that connects the two layers.
 * Malformed model output fails canonical validation and never reaches Builder.
 */
import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import type { ProcessingEventBus } from "../../runtime/event-bus.js";
import { ResearchEvidenceCollector } from "./tool/evidence/collector.js";
import { structuredDraftToResearchBundle } from "./structured-draft.js";
import { parseStructuredDraft } from "./parse-structured-draft.js";
import {
  RESEARCH_SYSTEM_INSTRUCTION,
  buildResearchUserRequest,
} from "./research-instruction.js";
import type { ModelProvider, ModelResponse } from "./provider/model-provider.js";
import type {
  ResearchProvider,
  ResearchProviderReadiness,
} from "./provider.js";

export interface RemoteChatResearchProviderOptions {
  projectRoot: string;
  modelProvider: ModelProvider;
  /** Resolved non-secret model id used for this provider. */
  model: string;
  /** Optional BYOK credential for secret-redaction of error surfaces. */
  apiKey?: string;
  timeoutSeconds?: number;
  maxOutputTokens?: number;
  temperature?: number;
  /**
   * Optional research-tool configuration (Tavily). Tavily is a research TOOL:
   * enabling it enriches evidence and never changes the model provider.
   */
  tavily?: {
    enabled?: boolean;
    apiKey?: string;
    searchDepth?: "basic" | "advanced";
    maxResults?: number;
  };
  events?: ProcessingEventBus;
}

export class RemoteChatResearchProvider implements ResearchProvider {
  private readonly evidence: ResearchEvidenceCollector;
  private readonly events?: ProcessingEventBus;

  constructor(private readonly options: RemoteChatResearchProviderOptions) {
    this.evidence = new ResearchEvidenceCollector(
      options.projectRoot,
      options.tavily
        ? {
            enabled: options.tavily.enabled,
            apiKey: options.tavily.apiKey,
            searchDepth: options.tavily.searchDepth,
            maxResults: options.tavily.maxResults,
          }
        : undefined,
    );
    this.events = options.events;
  }

  private redact(text: string): string {
    if (!this.options.apiKey) return text;
    return text.split(this.options.apiKey).join("[REDACTED]");
  }

  async ready(_runId: string): Promise<ResearchProviderReadiness> {
    const result = await this.options.modelProvider.testConnection();
    return {
      ready: result.ok,
      provider: result.provider,
      models: [result.model ?? this.options.model],
      detail: [result.category, result.detail || result.message]
        .filter(Boolean)
        .join(": "),
    };
  }

  async research(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    const { modelProvider, model } = this.options;
    const gathered = await this.evidence.collect(prompt);
    let response: ModelResponse;
    try {
      response = await modelProvider.generate({
        model,
        messages: [
          { role: "system", content: RESEARCH_SYSTEM_INSTRUCTION },
          {
            role: "user",
            content: buildResearchUserRequest(prompt, gathered),
          },
        ],
        temperature: this.options.temperature ?? 0.2,
        responseFormat: "json",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new WorkflowRootCauseError({
        issue: `${modelProvider.id} model inference failed`,
        expected: `${modelProvider.id} ${model} returns a model response within ${this.options.timeoutSeconds ?? 300}s`,
        actual: this.redact(message),
        evidence_ids: [],
        required_correction:
          "Correct the provider credential/configuration or model response",
        recheck_target: runId,
      });
    }
    // ONE shared canonical parse/validation path for every provider.
    const draft = parseStructuredDraft(response.text, modelProvider.id);
    return await structuredDraftToResearchBundle({
      projectRoot: this.options.projectRoot,
      prompt,
      runId,
      draft,
      gathered,
      providerSource: `${modelProvider.id}:${response.model}`,
      providerProvenance: `remote-${modelProvider.id}-model-inference`,
      incompleteIssue: `${modelProvider.id} research draft incomplete`,
      incompleteCorrection:
        "Correct the Researcher instruction or the provider model response",
    });
  }

  close(): void {
    this.options.modelProvider.close?.();
  }
}