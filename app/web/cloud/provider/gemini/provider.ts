import type {
  Prompt,
  ResearchBundle,
} from "../../../../../backend/contracts/schema/types.js";
import { positiveInt, resolveTestDraftFile } from "../shared/env.js";
import {
  WorkerPoolResearchProvider,
  type ProviderDescriptor,
} from "../shared/research-provider.js";
import type { GeminiConfig, GeminiProviderHealth } from "./types.js";
import { GeminiWorker } from "./worker-bridge.js";

function configuredModel(name: string): string {
  return (process.env[name] || "").trim();
}

function envTrue(name: string): boolean {
  return /^(?:1|true|yes)$/i.test((process.env[name] || "").trim());
}

export function loadGeminiConfig(
  projectRoot: string,
  model?: string,
): GeminiConfig {
  const testDraftFile = resolveTestDraftFile(
    projectRoot,
    "ONESHOT_GEMINI_TEST_DRAFT_FILE",
  );

  const dynamicModel = (model || configuredModel("GEMINI_MODEL") || "").trim();

  const distributionModel =
    dynamicModel ||
    configuredModel("GEMINI_DISTRIBUTION_MODEL") ||
    (testDraftFile ? "test-distribution" : "");
  const researchModel =
    dynamicModel ||
    configuredModel("GEMINI_RESEARCH_MODEL") ||
    (testDraftFile ? "test-research" : "");
  const synthesisModel =
    dynamicModel ||
    configuredModel("GEMINI_SYNTHESIS_MODEL") ||
    (testDraftFile ? "test-synthesis" : "");

  if (!testDraftFile && !dynamicModel) {
    const missing = [
      ["GEMINI_DISTRIBUTION_MODEL", distributionModel],
      ["GEMINI_RESEARCH_MODEL", researchModel],
      ["GEMINI_SYNTHESIS_MODEL", synthesisModel],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length) {
      throw new Error(
        `Gemini Researcher pipeline is not bound: missing ${missing.join(", ")} or GEMINI_MODEL`,
      );
    }
    if (
      new Set([distributionModel, researchModel, synthesisModel]).size !== 3
    ) {
      throw new Error(
        "Gemini Researcher pipeline requires three distinct model bindings: distribution, research, synthesis",
      );
    }
  }

  return {
    model: dynamicModel || synthesisModel,
    distributionModel,
    researchModel,
    synthesisModel,
    googleCloudProject:
      (process.env.GOOGLE_CLOUD_PROJECT || "").trim() || undefined,
    googleCloudLocation:
      (process.env.GOOGLE_CLOUD_LOCATION || "global").trim() || "global",
    useVertexAi: envTrue("GOOGLE_GENAI_USE_VERTEXAI"),
    workerPoolSize: positiveInt(process.env.GEMINI_NUM_PARALLEL, 2),
    cacheUrl: process.env.REDIS_URL || process.env.CACHE_URL || undefined,
    cacheTtlSeconds: positiveInt(process.env.CACHE_TTL, 3600),
    timeoutSeconds: positiveInt(process.env.GEMINI_TIMEOUT_SECONDS, 300),
    testDraftFile,
  };
}

function pipelineModels(config: GeminiConfig): string[] {
  return [
    config.distributionModel,
    config.researchModel,
    config.synthesisModel,
  ];
}

const geminiDescriptor: ProviderDescriptor<GeminiConfig, GeminiProviderHealth> =
  {
    provider: "gemini",
    label: "Gemini",
    eventPrefix: "Provider:gemini",
    fallbackModels: pipelineModels,
    emptyPoolModels: () => [],
    healthModels: (health) => health.models,
    healthDetail: (health) =>
      health.detail ||
      `${health.backend}:${health.google_cloud_location || ""}`,
    issue: "Gemini Researcher model pipeline failed",
    expected: () =>
      "Gemini distribution -> research -> synthesis pipeline returns one structured research draft",
    requiredCorrection:
      "Correct the three GEMINI_* model bindings, Google authentication/Vertex configuration, or structured model response",
    providerSource: (config) => {
      const models = pipelineModels(config);
      const uniqueModels = Array.from(new Set(models.filter(Boolean)));
      const modelTag =
        uniqueModels.length === 1 ? uniqueModels[0] : models.join("->");
      return `gemini-pipeline:${modelTag}`;
    },
    providerProvenance: (config) =>
      config.useVertexAi ? "vertex-ai-native-gemini" : "gemini-api-native",
    incompleteIssue: "Gemini research draft incomplete",
    incompleteCorrection:
      "Correct Researcher Gemini pipeline instructions or model response",
  };

export class GeminiModelProvider extends WorkerPoolResearchProvider<
  GeminiConfig,
  GeminiProviderHealth
> {
  constructor(projectRoot: string, config = loadGeminiConfig(projectRoot)) {
    super(
      projectRoot,
      config,
      geminiDescriptor,
      (root, cfg, onEvent) => new GeminiWorker(root, cfg, onEvent),
    );
  }
}
