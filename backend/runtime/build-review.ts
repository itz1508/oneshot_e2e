import { isDeepStrictEqual } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";
import actionSchema from "../schema/build-review-action.schema.json" with { type: "json" };
import type { ConfirmedPackage } from "../contracts/schema/types.js";
import { loadOptionalArtifact, type ArtifactStore } from "./artifact-store.js";

const validateAction = new Ajv2020({ strict: true }).compile(actionSchema);
export class BuildReviewError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}
export interface BuildReview {
  run_id: string;
  hash: string;
  plan_id: string;
  revision: number;
  status: "pending" | "approved";
  confirmed: true;
  validation: { schema: "VALID"; fixture: "VALID"; goal: "VALID" };
  steps: Array<{
    step_id: string;
    description: string;
    responsibility: string;
  }>;
  created_at: string;
}
interface GateRecord {
  review: BuildReview;
  package: ConfirmedPackage;
}

/** Support state only. Approval never changes the comparable confirmed core. */
export class BuildReviewService {
  constructor(private store: ArtifactStore) {}

  async enable(runId: string): Promise<void> {
    await this.store.save(runId, "build-review.request", { enabled: true });
  }
  async enabled(runId: string): Promise<boolean> {
    return (
      (await this.optional<{ enabled: boolean }>(runId, "build-review.request"))
        ?.enabled === true
    );
  }
  private async optional<T>(
    runId: string,
    name: string,
  ): Promise<T | undefined> {
    return loadOptionalArtifact<T>(this.store, runId, name);
  }
  private async create(
    runId: string,
    name: string,
    value: unknown,
  ): Promise<boolean> {
    if (!this.store.create)
      throw new BuildReviewError(
        "Artifact store cannot atomically record build authorization",
        503,
      );
    return this.store.create(runId, name, value);
  }
  async open(
    runId: string,
    confirmed: ConfirmedPackage,
    hash: string,
  ): Promise<BuildReview> {
    const triple = confirmed.core.triple_validation;
    if (
      !confirmed.confirmed ||
      !triple.all_valid ||
      [
        triple.schema_validation,
        triple.fixture_validation,
        triple.goal_validation,
      ].some((v) => v.result !== "Passed") ||
      !/^[a-f0-9]{64}$/.test(hash)
    ) {
      throw new BuildReviewError(
        "Build Ready requires the confirmed package, all valid proofs, and its hash",
      );
    }
    const plan = confirmed.core.plan;
    const record: GateRecord = {
      package: confirmed,
      review: {
        run_id: runId,
        hash,
        plan_id: plan.plan_id,
        revision: plan.revision,
        status: "pending",
        confirmed: true,
        validation: { schema: "VALID", fixture: "VALID", goal: "VALID" },
        steps: plan.steps.map(({ step_id, description, responsibility }) => ({
          step_id,
          description,
          responsibility,
        })),
        created_at: new Date().toISOString(),
      },
    };
    await this.create(runId, "build-review", record);
    const existing = await this.store.load<GateRecord>(runId, "build-review");
    if (
      existing.review.hash !== hash ||
      !isDeepStrictEqual(existing.package, confirmed)
    )
      throw new BuildReviewError(
        "Confirmed package changed; previous build authorization cannot be reused",
      );
    return (await this.get(runId))!;
  }
  async get(runId: string): Promise<BuildReview | undefined> {
    const record = await this.optional<GateRecord>(runId, "build-review");
    if (!record) return undefined;
    const approval = await this.optional<{ hash: string }>(
      runId,
      "build-approval",
    );
    return {
      ...record.review,
      status: approval?.hash === record.review.hash ? "approved" : "pending",
    };
  }
  async decide(runId: string, input: unknown): Promise<BuildReview> {
    if (!validateAction(input))
      throw new BuildReviewError(
        "Provide action approve or return and the current confirmation hash",
        400,
      );
    const action = input as { action: "approve" | "return"; hash: string };
    const record = await this.optional<GateRecord>(runId, "build-review");
    if (!record)
      throw new BuildReviewError("Build is not ready for authorization", 404);
    if (action.hash !== record.review.hash)
      throw new BuildReviewError("Build hash changed; reload Build Ready");
    const current = await this.store.load<ConfirmedPackage>(runId, "confirmed");
    if (!isDeepStrictEqual(current, record.package))
      throw new BuildReviewError(
        "Confirmed package changed; reload Build Ready",
      );
    if (action.action === "return") {
      const gate = (await this.get(runId))!;
      if (gate.status !== "pending")
        throw new BuildReviewError("Build has already been authorized");
      return gate;
    }
    await this.create(runId, "build-approval", {
      hash: action.hash,
      approved_at: new Date().toISOString(),
    });
    return (await this.get(runId))!;
  }
  async requireApproved(
    runId: string,
    confirmed: ConfirmedPackage,
    hash: string,
  ): Promise<void> {
    const gate = await this.get(runId);
    const record = await this.optional<GateRecord>(runId, "build-review");
    if (
      !gate ||
      gate.status !== "approved" ||
      gate.hash !== hash ||
      !isDeepStrictEqual(record?.package, confirmed)
    )
      throw new BuildReviewError(
        "Explicit authorization for this confirmed package is required before Builder",
      );
  }
  async wait(runId: string, isTerminal: () => boolean): Promise<void> {
    const deadline = Date.now() + 24 * 60 * 60 * 1000;
    while (!isTerminal() && Date.now() < deadline) {
      if ((await this.get(runId))?.status === "approved") return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new BuildReviewError("Build authorization ended before confirmation");
  }
}
