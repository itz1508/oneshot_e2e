import type { Prompt, ResearchBundle } from "../../../../../backend/contracts/schema/types.js";
import {
  positiveInt,
  resolveTestDraftFile,
} from "../shared/env.js";
import {
  WorkerPoolResearchProvider,
  type ProviderDescriptor,
} from "../shared/research-provider.js";
import type { AnthropicConfig, AnthropicHealth } from "./types.js";
import { AnthropicWorker } from "./worker-bridge.js";

export function loadAnthropicConfig(projectRoot: string): AnthropicConfig {
  return {
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    baseUrl:
      process.env.ANTHROPIC_API_BASE || "https://api.anthropic.com/v1",
    workerPoolSize: positiveInt(process.env.ANTHROPIC_NUM_PARALLEL, 2),
    timeoutSeconds: positiveInt(process.env.ANTHROPIC_TIMEOUT_SECONDS, 300),
    maxTokens: positiveInt(process.env.ANTHROPIC_MAX_TOKENS, 4096),
    testDraftFile: resolveTestDraftFile(
      projectRoot,
      "ONESHOT_ANTHROPIC_TEST_DRAFT_FILE",
    ),
  };
}

const anthropicDescriptor: ProviderDescriptor<AnthropicConfig, AnthropicHealth> = {
  provider: "anthropic",
  label: "Anthropic",
  eventPrefix: "Provider:anthropic",
  fallbackModels: (config) => [config.model],
  healthModels: (health) => [health.model],
  healthDetail: (health) => health.detail || health.api_base,
  issue: "Anthropic Researcher model pipeline failed",
  expected: () => "Anthropic Claude returns a structured research draft",
  requiredCorrection:
    "Correct the ANTHROPIC_API_KEY, model binding, Anthropic runtime, or structured model response",
  providerSource: (config) => `anthropic:${config.model}`,
  providerProvenance: () => "remote-anthropic-api",
  incompleteIssue: "Anthropic research draft incomplete",
  incompleteCorrection:
    "Correct Researcher Anthropic pipeline instructions or model response",
};

export class AnthropicModelProvider extends WorkerPoolResearchProvider<
  AnthropicConfig,
  AnthropicHealth
> {
  constructor(projectRoot: string, config = loadAnthropicConfig(projectRoot)) {
    super(
      projectRoot,
      config,
      anthropicDescriptor,
      (root, cfg, onEvent) => new AnthropicWorker(root, cfg, onEvent),
    );
  }
}
