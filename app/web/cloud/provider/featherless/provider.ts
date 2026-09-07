import type { Prompt, ResearchBundle } from "../../../../../backend/contracts/schema/types.js";
import {
  positiveInt,
  resolveTestDraftFile,
} from "../shared/env.js";
import {
  WorkerPoolResearchProvider,
  type ProviderDescriptor,
} from "../shared/research-provider.js";
import type { FeatherlessConfig, FeatherlessHealth } from "./types.js";
import { FeatherlessWorker } from "./worker-bridge.js";

export function loadFeatherlessConfig(projectRoot: string): FeatherlessConfig {
  return {
    model: process.env.FEATHERLESS_MODEL || "google/gemma-4-31B-it",
    baseUrl:
      process.env.FEATHERLESS_API_BASE || "https://api.featherless.ai/v1",
    workerPoolSize: positiveInt(process.env.FEATHERLESS_NUM_PARALLEL, 2),
    timeoutSeconds: positiveInt(process.env.FEATHERLESS_TIMEOUT_SECONDS, 300),
    maxTokens: positiveInt(process.env.FEATHERLESS_MAX_TOKENS, 4096),
    appUrl: process.env.FEATHERLESS_APP_URL || undefined,
    testDraftFile: resolveTestDraftFile(
      projectRoot,
      "ONESHOT_FEATHERLESS_TEST_DRAFT_FILE",
    ),
  };
}

/**
 * Python workers emit uppercase legacy states ("RUNNING"/"COMPLETE"); the
 * canonical event stream carries ExecutionStatus ("Running"/"Completed").
 */
function normalizeExecutionStatus(
  state: string,
): "Running" | "Completed" | "Failed" {
  const normalized = state.trim().toLowerCase();
  if (normalized === "complete" || normalized === "completed") {
    return "Completed";
  }
  if (normalized === "failed") {
    return "Failed";
  }
  return "Running";
}

const featherlessDescriptor: ProviderDescriptor<
  FeatherlessConfig,
  FeatherlessHealth
> = {
  provider: "featherless",
  label: "Featherless",
  eventPrefix: "Provider:featherless",
  normalizeState: normalizeExecutionStatus,
  fallbackModels: (config) => [config.model],
  healthModels: (health) => [health.model],
  healthDetail: (health) => health.detail || health.api_base,
  issue: "Featherless research provider failed",
  expected: (config) =>
    `Featherless ${config.model} returns a structured research draft within ${config.timeoutSeconds}s`,
  requiredCorrection:
    "Set FEATHERLESS_API_KEY, install requirements/featherless.txt, and correct the provider or model response",
  providerSource: (config) => `featherless:${config.model}`,
  providerProvenance: () => "remote-featherless-openai-compatible",
  incompleteIssue: "Featherless research draft incomplete",
  incompleteCorrection:
    "Correct the Researcher instruction or Featherless model response",
};

export class FeatherlessResearchProvider extends WorkerPoolResearchProvider<
  FeatherlessConfig,
  FeatherlessHealth
> {
  constructor(
    projectRoot: string,
    config = loadFeatherlessConfig(projectRoot),
  ) {
    super(
      projectRoot,
      config,
      featherlessDescriptor,
      (root, cfg, onEvent) => new FeatherlessWorker(root, cfg, onEvent),
    );
  }
}
