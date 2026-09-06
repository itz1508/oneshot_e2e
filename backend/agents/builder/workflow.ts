import type { ConfirmedPackage } from "../../contracts/schema/types.js";
import type { SandboxExecutionResult } from "../../sandbox/types.js";
import { SandboxService } from "../../sandbox/sandbox-service.js";
import { BuilderAgent } from "./agent.js";

/** Narrow Builder agent boundary over the existing governed SandboxService. */
export class BuilderWorkflow {
  readonly agent = BuilderAgent;

  constructor(private sandbox: SandboxService) {}

  async run(
    confirmedPackage: ConfirmedPackage,
    hash: string,
  ): Promise<SandboxExecutionResult> {
    return await this.sandbox.execute({
      confirmed_package: confirmedPackage,
      hash,
    });
  }
}
