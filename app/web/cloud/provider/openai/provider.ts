import type { Prompt, ResearchBundle } from "../../../../../backend/contracts/schema/types.js";
import {
  positiveInt,
  resolveTestDraftFile,
} from "../shared/env.js";
import {
  WorkerPoolResearchProvider,
  type ProviderDescriptor,
} from "../shared/research-provider.js";
import type { OpenAIConfig, OpenAIHealth } from "./types.js";
import { OpenAIWorker } from "./worker-bridge.js";

export function loadOpenAIConfig(projectRoot: string): OpenAIConfig {
  return {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    baseUrl: process.env.OPENAI_API_BASE || "https://api.openai.com/v1",
    temperature: process.env.OPENAI_TEMPERATURE
      ? Number(process.env.OPENAI_TEMPERATURE)
      : undefined,
    workerPoolSize: positiveInt(process.env.OPENAI_NUM_PARALLEL, 2),
    timeoutSeconds: positiveInt(process.env.OPENAI_TIMEOUT_SECONDS, 300),
    maxTokens: positiveInt(process.env.OPENAI_MAX_TOKENS, 4096),
    appUrl: process.env.OPENAI_APP_URL || undefined,
    testDraftFile: resolveTestDraftFile(
      projectRoot,
      "ONESHOT_OPENAI_TEST_DRAFT_FILE",
    ),
  };
}

const openAIDescriptor: ProviderDescriptor<OpenAIConfig, OpenAIHealth> = {
  provider: "openai",
  label: "OpenAI",
  eventPrefix: "Provider:openai",
  fallbackModels: (config) => [config.model],
  healthModels: (health) => [health.model],
  healthDetail: (health) => health.detail || health.api_base,
  issue: "OpenAI research provider failed",
  expected: (config) =>
    `OpenAI ${config.model} returns a structured research draft within ${config.timeoutSeconds}s`,
  requiredCorrection:
    "Set OPENAI_API_KEY, install requirements/openai.txt, and correct the provider or model response",
  providerSource: (config) => `openai:${config.model}`,
  providerProvenance: () => "remote-openai-compatible",
  incompleteIssue: "OpenAI research draft incomplete",
  incompleteCorrection:
    "Correct the Researcher instruction or OpenAI model response",
};

export class OpenAIModelProvider extends WorkerPoolResearchProvider<
  OpenAIConfig,
  OpenAIHealth
> {
  constructor(projectRoot: string, config = loadOpenAIConfig(projectRoot)) {
    super(
      projectRoot,
      config,
      openAIDescriptor,
      (root, cfg, onEvent) => new OpenAIWorker(root, cfg, onEvent),
    );
  }
}
