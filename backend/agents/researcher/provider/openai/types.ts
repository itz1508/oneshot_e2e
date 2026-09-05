import type { StructuredResearchDraft } from "../structured-draft.js";

export type OpenAIResearchDraft = StructuredResearchDraft;

export interface OpenAIConfig {
  apiKey?: string;
  temperature?: number;
  model: string;
  baseUrl: string;
  workerPoolSize: number;
  timeoutSeconds: number;
  maxTokens: number;
  appUrl?: string;
  testDraftFile?: string;
}

export interface OpenAIWorkerEvent {
  node: string;
  state: "RUNNING" | "COMPLETE";
  message?: string;
}
