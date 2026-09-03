import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { RunRepository } from "../runtime/run-repository.js";

// Canonical validation ownership (Batch C):
//   schema/*.json     JSON Schema contract authority
//   validation/*.py   deterministic Python validation/proof (exposed via validation.rpc)
//   this module       narrow TypeScript ORCHESTRATION ONLY
//
// This boundary never decides VALID/NOT_VALID itself. It associates run/plan IDs, invokes the
// canonical Python validator through `python -m validation.rpc` (JSON-lines over stdio), parses the
// returned envelope, verifies every returned ID, and aggregates statuses. It fails closed: an
// unavailable process, malformed envelope, or ID mismatch raises instead of fabricating VALID.

const PROJECT_ROOT = (process.env.ONESHOT_ROOT || "").trim() || process.cwd();

export interface TripleValidationInputs {
  plan: Record<string, unknown>;
  validation: Record<string, unknown>;
  schema_artifact: Record<string, unknown>;
  fixture: Record<string, unknown>;
  goal: Record<string, unknown>;
}

export interface ValidationContract {
  plan_id: string;
  result: "VALID" | "NOT_VALID";
  evidence: unknown[];
  [key: string]: unknown;
}

export interface TripleValidationResult {
  plan_id: string;
  validation_id: string;
  schema_validation: ValidationContract;
  fixture_validation: ValidationContract;
  goal_validation: ValidationContract;
  all_valid: boolean;
}

/**
 * Default deterministic validation transport: spawn `python -m validation.rpc` (validation/rpc.py)
 * with cwd = project root and send a single JSON-lines request {id, command, payload}; resolve with
 * {result} when the {ok} line for our id arrives, or reject on {ok:false} / spawn failure / timeout.
 */
export type ValidationRpc = (
  command: string,
  payload: TripleValidationInputs,
) => Promise<Record<string, unknown>>;

export const invokeValidationRpc: ValidationRpc = (command, payload) =>
  new Promise<Record<string, unknown>>((resolveOut, rejectOut) => {
    const python = (process.env.ONESHOT_PYTHON || "python").trim();
    const cwd = resolve(PROJECT_ROOT);
    const requestId = `tsrv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const timeoutMs = Number(process.env.ONESHOT_VALIDATION_TIMEOUT_MS || 30000);
    let settled = false;
    let stdoutBuf = "";
    let stderrBuf = "";

    const child = spawn(python, ["-m", "validation.rpc"], {
      cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      rejectOut(new Error(`validation RPC timeout for command "${command}"`));
    }, timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (data: string) => {
      stdoutBuf += data;
      for (;;) {
        const nl = stdoutBuf.indexOf("\n");
        if (nl < 0) break;
        const line = stdoutBuf.slice(0, nl);
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line.trim()) continue;
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg?.id !== requestId) continue;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (msg.ok) {
          resolveOut(msg.result);
        } else {
          rejectOut(new Error(`validation RPC failed: ${msg.error || "unknown error"}`));
        }
      }
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (data: string) => {
      stderrBuf += data;
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectOut(
        new Error(`validation RPC process unavailable (${python} -m validation.rpc): ${error.message}`),
      );
    });

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectOut(new Error(`validation RPC exited before response (code=${code}): ${stderrBuf.trim()}`));
    });

    child.stdin?.write(JSON.stringify({ id: requestId, command, payload }) + "\n");
    child.stdin?.end();
  });

/**
 * Verify every returned ID against the submitted contracts. Any mismatch or malformed sub-result is
 * treated as a transport/contract failure (fail closed) — never interpreted as valid.
 */
function assertContractIntegrity(
  runPlanId: string,
  inputs: TripleValidationInputs,
  envelope: TripleValidationResult,
): void {
  const plan = inputs.plan as Record<string, unknown>;
  const validation = inputs.validation as Record<string, unknown>;
  const schemaArtifact = inputs.schema_artifact as Record<string, unknown>;
  const fixture = inputs.fixture as Record<string, unknown>;
  const goal = inputs.goal as Record<string, unknown>;

  const problems: string[] = [];
  const eq = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");

  if (!eq(envelope.plan_id, runPlanId)) problems.push("envelope.plan_id != run plan_id");
  if (!eq(envelope.plan_id, plan.plan_id)) problems.push("envelope.plan_id != input plan_id");
  if (!eq(envelope.validation_id, validation.validation_id)) problems.push("validation_id mismatch");

  const s = envelope.schema_validation;
  const f = envelope.fixture_validation;
  const g = envelope.goal_validation;
  if (!s || !f || !g) problems.push("missing sub-validation contract");

  if (s) {
    if (!eq(s.plan_id, runPlanId)) problems.push("schema_validation.plan_id mismatch");
    if (!eq(s.schema_id, schemaArtifact.schema_id)) problems.push("schema_id mismatch");
    if (s.result !== "VALID" && s.result !== "NOT_VALID") problems.push("schema result malformed");
  }
  if (f) {
    if (!eq(f.plan_id, runPlanId)) problems.push("fixture_validation.plan_id mismatch");
    if (!eq(f.fixture_id, fixture.fixture_id)) problems.push("fixture_id mismatch");
    if (f.result !== "VALID" && f.result !== "NOT_VALID") problems.push("fixture result malformed");
  }
  if (g) {
    if (!eq(g.plan_id, runPlanId)) problems.push("goal_validation.plan_id mismatch");
    if (!eq(g.goal_id, goal.goal_id)) problems.push("goal_id mismatch");
    if (g.result !== "VALID" && g.result !== "NOT_VALID") problems.push("goal result malformed");
  }

  if (problems.length > 0) {
    throw new Error(`validation envelope integrity failure: ${problems.join("; ")}`);
  }
}

/**
 * Triple Validation Manager — TypeScript orchestration boundary only.
 *
 * Responsibilities:
 *  - bind a run to its plan_id
 *  - invoke the canonical deterministic Python validator (validation.rpc "triple-validation")
 *  - parse the returned envelope and verify every plan/schema/fixture/goal/validation ID
 *  - assemble the aggregated result (VALID only if Python reported all three VALID)
 *
 * It never computes VALID/NOT_VALID and never fabricates a proof.
 */
export class TripleValidationManager {
  private runs: RunRepository;
  private rpc: ValidationRpc;

  constructor(runs: RunRepository, rpc: ValidationRpc = invokeValidationRpc) {
    this.runs = runs;
    this.rpc = rpc;
  }

  async performTripleValidation(
    runId: string,
    inputs: TripleValidationInputs,
  ): Promise<TripleValidationResult> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }
    const runPlanId = run.plan_id;
    if (!runPlanId) {
      throw new Error(`No plan_id found for run ${runId}`);
    }
    const inputPlanId = String(inputs.plan?.plan_id ?? "");
    if (inputPlanId !== runPlanId) {
      throw new Error(
        `plan_id mismatch for run ${runId}: input plan_id=${inputPlanId || "<undefined>"} != run plan_id=${runPlanId}`,
      );
    }

    const result = (await this.rpc("triple-validation", inputs)) as unknown as TripleValidationResult;
    assertContractIntegrity(runPlanId, inputs, result);
    return result;
  }
}