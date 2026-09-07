import type { StructuredResearchDraft } from "../structured-draft.js";
import type { ProviderWorkerEvent, WorkerPoolConfig } from "../shared/types.js";

export type GeminiResearchDraft = StructuredResearchDraft;

export type GeminiWorkerNodeEvent = ProviderWorkerEvent;

export interface GeminiConfig extends WorkerPoolConfig {
  apiKey?: string;
  temperature?: number;
  baseUrl?: string;
  model?: string;
  distributionModel: string;
  researchModel: string;
  synthesisModel: string;
  googleCloudProject?: string;
  googleCloudLocation: string;
  useVertexAi: boolean;
  cacheUrl?: string;
  cacheTtlSeconds: number;
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
