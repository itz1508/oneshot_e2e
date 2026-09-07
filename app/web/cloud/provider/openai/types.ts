import type { StructuredResearchDraft } from "../structured-draft.js";
import type { ProviderWorkerEvent, WorkerPoolConfig } from "../shared/types.js";

export type OpenAIResearchDraft = StructuredResearchDraft;

export type OpenAIWorkerEvent = ProviderWorkerEvent;

export interface OpenAIConfig extends WorkerPoolConfig {
  apiKey?: string;
  temperature?: number;
  model: string;
  baseUrl: string;
  maxTokens: number;
  appUrl?: string;
  testDraftFile?: string;
}

export interface OpenAIHealth {
  ready: boolean;
  provider: "openai";
  model: string;
  api_base: string;
  detail?: string;
}
