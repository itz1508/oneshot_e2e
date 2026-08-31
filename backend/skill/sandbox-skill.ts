import { ToolRegistry } from "../tool/registry.js";
import type { SandboxService } from "../sandbox/sandbox-service.js";
import type { SandboxExecutionInput } from "../sandbox/types.js";
import { projectSandboxGraph } from "../sandbox/graph/sandbox-graph.js";
import { verifySandboxAdmission } from "../sandbox/admission.js";
import type { CanonicalContractSkill } from "./canonical-contract-skill.js";

/**
 * Sandbox Runtime Skill — exposes tools for external sandbox admission,
 * execution, evidence auditing, and graph projection.
 *
 * This skill does NOT own Planner, Triple Validation, or canonical Hash creation.
 */
export class SandboxRuntimeSkill {
  private registry = new ToolRegistry();

  constructor(
    private sandbox: SandboxService,
    private contracts: CanonicalContractSkill,
  ) {
    this.registry.register(
      {
        name: "verify_admission",
        description: "Verify confirmed package structure and canonical hash admission",
      },
      (input: SandboxExecutionInput) => verifySandboxAdmission(input, this.contracts),
    );

    this.registry.register(
      {
        name: "execute_sandbox",
        description: "Execute confirmed package in hardened isolated sandbox boundary",
      },
      (input: SandboxExecutionInput) => this.sandbox.execute(input),
    );

    this.registry.register(
      {
        name: "audit_sandbox",
        description: "Read recorded execution evidence and verification hash for a run",
      },
      ({ run_id }: { run_id: string }) => this.sandbox.getEvidence(run_id),
    );

    this.registry.register(
      {
        name: "project_sandbox_graph",
        description: "Read Sandbox Execution lifecycle graph projection",
      },
      ({ events }: { events?: any[] }) => projectSandboxGraph(events),
    );
  }

  async invoke<T>(name: string, input: unknown): Promise<T> {
    return (await this.registry.invoke(name, input)) as T;
  }

  definitions() {
    return this.registry.definitions();
  }
}
