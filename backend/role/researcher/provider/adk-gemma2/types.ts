import type { StructuredResearchDraft } from "../structured-draft.js";

export type AdkResearchDraft = StructuredResearchDraft;

export interface AdkGemmaConfig {
  model: string;
  ollamaBaseUrl: string;
  workerPoolSize: number;
  cacheUrl?: string;
  cacheTtlSeconds: number;
  autoPull: boolean;
  timeoutSeconds: number;
  testDraftFile?: string;
}

export interface AdkWorkerNodeEvent {
  node: string;
  state: "RUNNING" | "COMPLETE";
  message?: string;
}
