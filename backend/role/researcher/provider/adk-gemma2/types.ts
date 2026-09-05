import type { StructuredResearchDraft } from "../structured-draft.js";

export type AdkResearchDraft = StructuredResearchDraft;

export interface AdkGemmaConfig {
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

export interface AdkProviderHealth {
  ready: boolean;
  provider: "google-adk";
  models: string[];
  backend: "vertex-ai" | "gemini-api" | "deterministic-test";
  google_cloud_project?: string;
  google_cloud_location?: string;
  detail?: string;
}

export interface AdkWorkerNodeEvent {
  node: string;
  state: "RUNNING" | "COMPLETE";
  message?: string;
}
