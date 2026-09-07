import type { StructuredResearchDraft } from "../structured-draft.js";
import type { ProviderWorkerEvent, WorkerPoolConfig } from "../shared/types.js";

export type AnthropicResearchDraft = StructuredResearchDraft;

export type AnthropicWorkerEvent = ProviderWorkerEvent;

export interface AnthropicConfig extends WorkerPoolConfig {
  apiKey?: string;
  temperature?: number;
  model: string;
  baseUrl: string;
  maxTokens: number;
  testDraftFile?: string;
}

export interface AnthropicHealth {
  ready: boolean;
  provider: "anthropic";
  model: string;
  api_base: string;
  detail?: string;
}
