import { resolvePythonExecutable } from "../../../../../backend/python-runtime.js";
import { pythonPath } from "../shared/env.js";
import { NativeWorkerBridge } from "../shared/worker-bridge.js";
import type {
  AnthropicConfig,
  AnthropicHealth,
  AnthropicResearchDraft,
  AnthropicWorkerEvent,
} from "./types.js";

export type { AnthropicHealth } from "./types.js";

export class AnthropicWorker extends NativeWorkerBridge<
  AnthropicConfig,
  AnthropicHealth,
  AnthropicResearchDraft
> {
  constructor(
    projectRoot: string,
    config: AnthropicConfig,
    onEvent?: (runId: string, event: AnthropicWorkerEvent) => void,
    python: string = resolvePythonExecutable(projectRoot),
  ) {
    super(
      projectRoot,
      config,
      {
        provider: "anthropic",
        label: "Anthropic",
        scriptPath: "app/web/cloud/provider/native_worker.py",
        scriptArgs: ["anthropic"],
        buildEnv: (c) => ({
          ...process.env,
          ANTHROPIC_API_KEY: c.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
          ANTHROPIC_TEMPERATURE:
            c.temperature === undefined ? "" : String(c.temperature),
          ANTHROPIC_API_BASE: c.baseUrl,
          ANTHROPIC_MODEL: c.model,
          ANTHROPIC_TIMEOUT_SECONDS: String(c.timeoutSeconds),
          ANTHROPIC_MAX_TOKENS: String(c.maxTokens),
          ONESHOT_ANTHROPIC_TEST_DRAFT_FILE: c.testDraftFile || "",
          ONESHOT_ANTHROPIC_EMIT_EVENTS: "true",
          PYTHONPATH: pythonPath(projectRoot),
        }),
      },
      onEvent,
      python,
    );
  }
}
