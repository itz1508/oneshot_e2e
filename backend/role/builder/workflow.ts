import type { ConfirmedPackage } from "../../contract/types.js";
import type { SandboxExecutionResult } from "../../sandbox/types.js";
import { SandboxService } from "../../sandbox/sandbox-service.js";
import { BuilderRole } from "./role.js";

/** Narrow Builder role boundary over the existing governed SandboxService. */
export class BuilderWorkflow {
  readonly role = BuilderRole;

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
