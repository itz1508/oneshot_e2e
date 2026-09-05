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
  /**
   * Probe/run credential. Supplied per-run or per-probe by the ProviderManager
   * (transient or server-side stored). Never persisted by the adapter and
   * never logged; overrides the GEMINI_API_KEY environment variable when
   * Vertex AI is disabled.
   */
  apiKey?: string;
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
