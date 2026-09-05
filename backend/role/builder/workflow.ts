import { Buffer } from "node:buffer";
import type { ConfirmedPackage } from "../../contracts/schema/types.js";
import type { SandboxExecutionResult } from "../../sandbox/types.js";
import { SandboxService } from "../../sandbox/sandbox-service.js";
import { BuilderRole } from "./role.js";

export const BUILDER_OUTPUT_PREFIX = "ONESHOT_BUILDER_OUTPUT_BASE64:";

export type BuilderWorkflowResult = SandboxExecutionResult & {
  final_output: string | null;
  output_step_id: string | null;
};

function decodeOutput(description: string): string | null {
  if (!description.startsWith(BUILDER_OUTPUT_PREFIX)) return null;
  const encoded = description.slice(BUILDER_OUTPUT_PREFIX.length);
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const roundTrip = Buffer.from(decoded, "utf8").toString("base64");
  return roundTrip === encoded ? decoded : null;
}

/**
 * Narrow Builder role boundary over the existing governed SandboxService.
 *
 * The provider-generated deliverable is carried by a validated BuilderOutput
 * plan step. It is exposed only after the corresponding sandbox step completed
 * successfully, keeping the result inside the canonical Plan -> Builder path.
 */
export class BuilderWorkflow {
  readonly role = BuilderRole;

  constructor(private sandbox: SandboxService) {}

  async run(
    confirmedPackage: ConfirmedPackage,
    hash: string,
  ): Promise<BuilderWorkflowResult> {
    const result = await this.sandbox.execute({
      confirmed_package: confirmedPackage,
      hash,
    });

    const outputIndex = confirmedPackage.core.plan.steps.findIndex(
      (step: { responsibility: string }) => step.responsibility === "BuilderOutput",
    );
    const outputStep =
      outputIndex >= 0
        ? confirmedPackage.core.plan.steps[outputIndex]
        : undefined;

    let finalOutput: string | null = null;
    if (
      result.result === "PASSED" &&
      outputStep &&
      result.evidence.exit_codes[outputIndex] === 0
    ) {
      finalOutput = decodeOutput(outputStep.description);
    }

    return {
      ...result,
      final_output: finalOutput,
      output_step_id: outputStep?.step_id ?? null,
    };
  }
}
