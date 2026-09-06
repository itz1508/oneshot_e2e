import type { StructuredResearchDraft } from "../structured-draft.js";

export type FeatherlessResearchDraft = StructuredResearchDraft;

export interface FeatherlessConfig {
  model: string;
  baseUrl: string;
  workerPoolSize: number;
  timeoutSeconds: number;
  maxTokens: number;
  appUrl?: string;
  testDraftFile?: string;
}

export interface FeatherlessWorkerEvent {
  node: string;
  state: "RUNNING" | "COMPLETE";
  message?: string;
}
