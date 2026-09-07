import type { StructuredResearchDraft } from "../structured-draft.js";
import type { ProviderWorkerEvent, WorkerPoolConfig } from "../shared/types.js";

export type FeatherlessResearchDraft = StructuredResearchDraft;

export type FeatherlessWorkerEvent = ProviderWorkerEvent;

export interface FeatherlessConfig extends WorkerPoolConfig {
  model: string;
  baseUrl: string;
  maxTokens: number;
  appUrl?: string;
  testDraftFile?: string;
}

export interface FeatherlessHealth {
  ready: boolean;
  provider: "featherless";
  model: string;
  api_base: string;
  detail?: string;
}
