import type { StructuredResearchDraft } from "../structured-draft.js";

export type AdkResearchDraft = StructuredResearchDraft;

export interface AdkGemmaConfig {
  distributionModel: string;
  researchModel: string;
  synthesisModel: string;
  ollamaBaseUrl: string;
  workerPoolSize: number;
  cacheUrl?: string;
  cacheTtlSeconds: number;
  autoPull: boolean;
  timeoutSeconds: number;
  testDraftFile?: string;
}

export interface AdkProviderHealth {
  ready: boolean;
  provider: "google-adk";
  models: string[];
  ollama_api_base: string;
  detail?: string;
}

export interface AdkWorkerNodeEvent {
  node: string;
  state: "RUNNING" | "COMPLETE";
  message?: string;
}
