import { Buffer } from "node:buffer";
import type { ConfirmedPackage } from "../../contracts/schema/types.js";
import type { SandboxExecutionResult } from "../../sandbox/types.js";
import { SandboxService } from "../../sandbox/sandbox-service.js";
import { BuilderAgent } from "./agent.js";

export const BUILDER_OUTPUT_PREFIX = "ONESHOT_BUILDER_OUTPUT_BASE64:";
export type BuilderWorkflowResult = SandboxExecutionResult & {
  final_output: string | null;
  output_step_id: string | null;
};

/** Narrow Builder agent boundary over the existing governed SandboxService. */
export class BuilderWorkflow {
  readonly agent = BuilderAgent;

  constructor(private sandbox: SandboxService) {}

  async run(
    confirmedPackage: ConfirmedPackage,
    hash: string,
  ): Promise<BuilderWorkflowResult> {
    const result = await this.sandbox.execute({
      confirmed_package: confirmedPackage,
      hash,
    });
    const index = confirmedPackage.core.plan.steps.findIndex(step => step.responsibility === "BuilderOutput");
    const step = confirmedPackage.core.plan.steps[index];
    let output: string | null = null;
    if (result.result === "Passed" && result.hash_matched && step && result.evidence.exit_codes[index] === 0 && step.description.startsWith(BUILDER_OUTPUT_PREFIX)) {
      const encoded = step.description.slice(BUILDER_OUTPUT_PREFIX.length);
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      if (encoded && Buffer.from(decoded, "utf8").toString("base64") === encoded) output = decoded;
    }
    return { ...result, final_output: output, output_step_id: output ? step.step_id : null };
  }
}
