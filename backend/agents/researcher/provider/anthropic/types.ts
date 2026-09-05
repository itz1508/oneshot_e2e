import type { StructuredResearchDraft } from "../structured-draft.js";

export type AnthropicResearchDraft = StructuredResearchDraft;

export interface AnthropicConfig {
  apiKey?: string;
  temperature?: number;
  model: string;
  baseUrl: string;
  workerPoolSize: number;
  timeoutSeconds: number;
  maxTokens: number;
  testDraftFile?: string;
}

export interface AnthropicWorkerEvent {
  node: string;
  state: "RUNNING" | "COMPLETE";
  message?: string;
}
