import { resolvePythonExecutable } from "../../../../../backend/python-runtime.js";
import { pythonPath } from "../shared/env.js";
import { NativeWorkerBridge } from "../shared/worker-bridge.js";
import type {
  FeatherlessConfig,
  FeatherlessHealth,
  FeatherlessResearchDraft,
  FeatherlessWorkerEvent,
} from "./types.js";

export type { FeatherlessHealth } from "./types.js";

export class FeatherlessWorker extends NativeWorkerBridge<
  FeatherlessConfig,
  FeatherlessHealth,
  FeatherlessResearchDraft
> {
  constructor(
    projectRoot: string,
    config: FeatherlessConfig,
    onEvent?: (runId: string, event: FeatherlessWorkerEvent) => void,
    python: string = resolvePythonExecutable(projectRoot),
  ) {
    super(
      projectRoot,
      config,
      {
        provider: "featherless",
        label: "Featherless",
        scriptPath: "app/web/cloud/provider/featherless/worker.py",
        buildEnv: (c) => ({
          ...process.env,
          FEATHERLESS_API_BASE: c.baseUrl,
          FEATHERLESS_MODEL: c.model,
          FEATHERLESS_TIMEOUT_SECONDS: String(c.timeoutSeconds),
          FEATHERLESS_MAX_TOKENS: String(c.maxTokens),
          FEATHERLESS_APP_URL: c.appUrl || "",
          ONESHOT_FEATHERLESS_TEST_DRAFT_FILE: c.testDraftFile || "",
          ONESHOT_FEATHERLESS_EMIT_EVENTS: "true",
          PYTHONPATH: pythonPath(projectRoot),
        }),
        // Preserve the bridge's historical exit detail, which includes the
        // worker's stderr output for easier server-side debugging.
        exitDetail: (code, stderr) =>
          `Featherless worker exited (${code}): ${stderr}`,
      },
      onEvent,
      python,
    );
  }
}
