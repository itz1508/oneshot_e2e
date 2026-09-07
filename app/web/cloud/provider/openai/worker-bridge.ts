import { resolvePythonExecutable } from "../../../../../backend/python-runtime.js";
import { pythonPath } from "../shared/env.js";
import { NativeWorkerBridge } from "../shared/worker-bridge.js";
import type {
  OpenAIConfig,
  OpenAIHealth,
  OpenAIResearchDraft,
  OpenAIWorkerEvent,
} from "./types.js";

export type { OpenAIHealth } from "./types.js";

export class OpenAIWorker extends NativeWorkerBridge<
  OpenAIConfig,
  OpenAIHealth,
  OpenAIResearchDraft
> {
  constructor(
    projectRoot: string,
    config: OpenAIConfig,
    onEvent?: (runId: string, event: OpenAIWorkerEvent) => void,
    python: string = resolvePythonExecutable(projectRoot),
  ) {
    super(
      projectRoot,
      config,
      {
        provider: "openai",
        label: "OpenAI",
        scriptPath: "app/web/cloud/provider/native_worker.py",
        scriptArgs: ["openai"],
        buildEnv: (c) => ({
          ...process.env,
          OPENAI_API_KEY: c.apiKey ?? process.env.OPENAI_API_KEY ?? "",
          // Only override when configured; otherwise the compose/host env value
          // (e.g. OPENAI_TEMPERATURE=0 for deterministic local Gemma runs) flows
          // through the spread above untouched.
          ...(c.temperature === undefined
            ? {}
            : { OPENAI_TEMPERATURE: String(c.temperature) }),
          OPENAI_API_BASE: c.baseUrl,
          OPENAI_MODEL: c.model,
          OPENAI_TIMEOUT_SECONDS: String(c.timeoutSeconds),
          OPENAI_MAX_TOKENS: String(c.maxTokens),
          OPENAI_APP_URL: c.appUrl || "",
          ONESHOT_OPENAI_TEST_DRAFT_FILE: c.testDraftFile || "",
          ONESHOT_OPENAI_EMIT_EVENTS: "true",
          PYTHONPATH: pythonPath(projectRoot),
        }),
      },
      onEvent,
      python,
    );
  }
}
