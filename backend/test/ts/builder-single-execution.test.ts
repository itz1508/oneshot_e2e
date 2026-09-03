import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import type { Plan } from "../../contract/types.js";
import type { ExecutionAuthorization } from "../../sandbox/types.js";
import type {
  RunnerExecutionResult,
  SandboxRunner,
} from "../../sandbox/runner/runner.js";
import { harness, prompt } from "./harness.js";

class CountingSandboxRunner implements SandboxRunner {
  executions = 0;

  async execute(
    _sandboxId: string,
    _workspacePath: string,
    _plan: Plan,
    auth: ExecutionAuthorization,
  ): Promise<RunnerExecutionResult> {
    this.executions += 1;
    return {
      commands: ["echo Builder"],
      exit_codes: [0],
      stdout_lines: ["Builder"],
      stderr_lines: [],
      file_changes: [],
      bytes_written: 0,
      resource_usage: { duration_ms: 0, peak_memory_mb: 0, cpu_time_ms: 0 },
      environment_allowlist_used: [...auth.environment_allowlist],
      network_policy_used: auth.network_policy,
      cleanup_result: {
        workspace_cleaned: false,
        processes_terminated: true,
      },
      condition: "success",
    };
  }

  async cleanup(_sandboxId: string, workspacePath: string): Promise<boolean> {
    rmSync(workspacePath, { recursive: true, force: true });
    return true;
  }
}

test("normal canonical job invokes Sandbox through Builder exactly once", async () => {
  const runner = new CountingSandboxRunner();
  const h = await harness("builder-single-execution", undefined, runner);
  const runId = "builder-single-execution-run";
  h.runs.create(runId);

  try {
    const result = await h.runtime.run(runId, prompt(runId));
    assert.equal(result.result, "PASSED");
    assert.equal(runner.executions, 1);

    const builderEvents = result.events.filter(
      (event) => event.processor === "Builder" && event.state === "COMPLETE",
    );
    assert.equal(builderEvents.length, 1);
    assert.equal(builderEvents[0].result, "PASSED");
  } finally {
    h.close();
  }
});
