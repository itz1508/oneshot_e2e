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
  /**
   * Probe/run credential. Supplied per-run or per-probe by the ProviderManager
   * (transient or server-side stored). Never persisted by the adapter and
   * never logged; overrides the FEATHERLESS_API_KEY environment variable.
   */
  apiKey?: string;
}

export interface FeatherlessWorkerEvent {
  node: string;
  state: "RUNNING" | "COMPLETE";
  message?: string;
}
