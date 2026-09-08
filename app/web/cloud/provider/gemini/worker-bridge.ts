import { resolvePythonExecutable } from "../../../../../backend/python-runtime.js";
import { pythonPath } from "../shared/env.js";
import { NativeWorkerBridge } from "../shared/worker-bridge.js";
import type {
  GeminiConfig,
  GeminiProviderHealth,
  GeminiResearchDraft,
  GeminiWorkerNodeEvent,
} from "./types.js";

export type { GeminiProviderHealth } from "./types.js";

export class GeminiWorker extends NativeWorkerBridge<
  GeminiConfig,
  GeminiProviderHealth,
  GeminiResearchDraft
> {
  constructor(
    projectRoot: string,
    config: GeminiConfig,
    onEvent?: (runId: string, event: GeminiWorkerNodeEvent) => void,
    python: string = resolvePythonExecutable(projectRoot),
  ) {
    super(
      projectRoot,
      config,
      {
        provider: "gemini",
        label: "Gemini",
        scriptPath: "app/web/cloud/provider/native_worker.py",
        scriptArgs: ["gemini"],
        buildEnv: (c) => ({
          ...process.env,
          GEMINI_API_KEY: c.apiKey ?? process.env.GEMINI_API_KEY ?? "",
          GEMINI_MODEL: c.model || c.synthesisModel,
          GEMINI_TEMPERATURE:
            c.temperature === undefined ? "" : String(c.temperature),
          GEMINI_API_BASE:
            c.baseUrl || "https://generativelanguage.googleapis.com/v1beta",
          GEMINI_DISTRIBUTION_MODEL: c.distributionModel,
          GEMINI_RESEARCH_MODEL: c.researchModel,
          GEMINI_SYNTHESIS_MODEL: c.synthesisModel,
          GEMINI_TIMEOUT_SECONDS: String(c.timeoutSeconds),
          GOOGLE_CLOUD_PROJECT: c.googleCloudProject || "",
          GOOGLE_CLOUD_LOCATION: c.googleCloudLocation,
          GOOGLE_GENAI_USE_VERTEXAI: String(c.useVertexAi),
          CACHE_URL: c.cacheUrl || "",
          CACHE_TTL: String(c.cacheTtlSeconds),
          ONESHOT_GEMINI_TEST_DRAFT_FILE: c.testDraftFile || "",
          ONESHOT_GEMINI_EMIT_EVENTS: "true",
          PYTHONPATH: pythonPath(projectRoot),
        }),
      },
      onEvent,
      python,
    );
  }
}
