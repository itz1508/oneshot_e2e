import { node, type NodeContext } from "@google/adk";
import type { ConfirmedPackage, HashProof } from "../../../contracts/schema/types.js";
import type { HashWorkflow } from "../../hash.js";

export interface CreateHashNodeInput {
  job_id: string;
  confirmed: ConfirmedPackage;
}

export interface VerifyHashNodeInput {
  job_id: string;
  created_hash: string;
  sandbox_hash: string;
}

export function createCreateHashNode(hash: HashWorkflow) {
  return node(
    async (_ctx: NodeContext, input: CreateHashNodeInput): Promise<string> => {
      if (!/[A-Za-z]/.test(input.job_id)) throw new Error("ADK job_id must contain at least one non-numeric character");
      return await hash.create(input.confirmed);
    },
    { name: "CreateHash" },
  );
}

export function createVerifyHashNode(hash: HashWorkflow) {
  return node(
    async (_ctx: NodeContext, input: VerifyHashNodeInput): Promise<HashProof> => {
      if (!/[A-Za-z]/.test(input.job_id)) throw new Error("ADK job_id must contain at least one non-numeric character");
      return await hash.proof(input.created_hash, input.sandbox_hash);
    },
    { name: "Hash" },
  );
}
