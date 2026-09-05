import { node, type NodeContext } from "@google/adk";
import type { ConfirmedPackage } from "../../../contracts/schema/types.js";
import { BuilderRole } from "../../../role/builder/role.js";
import type { BuilderWorkflow } from "../../../role/builder/workflow.js";
import type { SandboxExecutionResult } from "../../../sandbox/types.js";

export interface BuilderNodeInput {
  job_id: string;
  confirmed: ConfirmedPackage;
  hash: string;
}

export function createBuilderNode(builder: BuilderWorkflow) {
  return node(
    async (_ctx: NodeContext, input: BuilderNodeInput): Promise<SandboxExecutionResult> => {
      if (!/[A-Za-z]/.test(input.job_id)) {
        throw new Error("ADK job_id must contain at least one non-numeric character");
      }
      return await builder.run(input.confirmed, input.hash);
    },
    { name: BuilderRole.id },
  );
}
