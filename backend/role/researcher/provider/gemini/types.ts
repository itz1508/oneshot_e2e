import type { StructuredResearchDraft } from "../structured-draft.js";

export type GeminiResearchDraft = StructuredResearchDraft;

export interface GeminiConfig {
  apiKey?: string;
  temperature?: number;
  baseUrl?: string;
  distributionModel: string;
  researchModel: string;
  synthesisModel: string;
  googleCloudProject?: string;
  googleCloudLocation: string;
  useVertexAi: boolean;
  workerPoolSize: number;
  cacheUrl?: string;
  cacheTtlSeconds: number;
  timeoutSeconds: number;
  testDraftFile?: string;
}

export interface GeminiProviderHealth {
  ready: boolean;
  provider: "gemini";
  models: string[];
  backend: "vertex-ai" | "gemini-api" | "deterministic-test";
  google_cloud_project?: string;
  google_cloud_location?: string;
  detail?: string;
}

export interface GeminiWorkerNodeEvent {
  node: string;
  state: "RUNNING" | "COMPLETE";
  message?: string;
}
