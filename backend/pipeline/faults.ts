export type FaultStage =
  | "researcher"
  | "planner"
  | "refactor"
  | "gap-analysis"
  | "evaluation"
  | "schema-validation"
  | "fixture-validation"
  | "goal-validation"
  | "builder"
  | "confirmation"
  | "hash"
  | "triple-validation"
  | "finalize";

export type FaultMode =
  | "none"
  | "fail-once"
  | "fail-always"
  | "delay"
  | "crash-once"
  | "crash"
  | "crash-after-checkpoint"
  | "refine-once";

export interface FaultConfig {
  stage: FaultStage;
  mode: FaultMode;
  delayMs?: number;
  /**
   * The fault only fires for stage executions at iteration >= minIteration
   * (default 0). Used to crash a refinement iteration while letting the
   * iteration-0 execution complete (freeze gate 2).
   */
  minIteration?: number;
}

/**
 * Fault injection is disabled unless:
 *
 *   PIPELINE_FAULTS_ENABLED=true
 *
 * This MUST remain disabled in production.
 */
export function faultsEnabled(): boolean {
  return process.env.PIPELINE_FAULTS_ENABLED === "true";
}

/**
 * Parse one fault spec object from arbitrary JSON input.
 * Returns null for malformed entries so one bad spec never kills the rest.
 */
function parseFaultSpec(input: unknown): FaultConfig | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const spec = input as Record<string, unknown>;
  const stage = String(spec.stage ?? "")
    .trim()
    .toLowerCase() as FaultStage;
  const mode = String(spec.mode ?? "")
    .trim()
    .toLowerCase() as FaultMode;

  if (!stage || !mode) {
    return null;
  }

  const minIterationRaw = Number(spec.minIteration ?? 0);

  return {
    stage,
    mode,
    delayMs: Number(spec.delayMs ?? 3000),
    minIteration:
      Number.isFinite(minIterationRaw) && minIterationRaw > 0
        ? Math.floor(minIterationRaw)
        : 0,
  };
}

/**
 * Resolve the active fault configurations.
 *
 * Two input forms:
 *
 *   1. Multi-fault JSON (supports refine + crash combinations):
 *        PIPELINE_FAULTS='[{"stage":"triple-validation","mode":"refine-once"},
 *                          {"stage":"evaluation","mode":"crash-after-checkpoint","minIteration":1}]'
 *
 *   2. Legacy single env pair (kept for the existing CI jobs):
 *        PIPELINE_FAULT_STAGE=evaluation
 *        PIPELINE_FAULT_MODE=crash-once
 */
export function getFaultConfigs(): FaultConfig[] {
  if (!faultsEnabled()) {
    return [];
  }

  const multi = process.env.PIPELINE_FAULTS?.trim();
  if (multi) {
    try {
      const parsed: unknown = JSON.parse(multi);
      const specs = Array.isArray(parsed) ? parsed : [parsed];
      const configs = specs
        .map(parseFaultSpec)
        .filter((config): config is FaultConfig => config !== null);
      if (configs.length > 0) {
        return configs;
      }
    } catch {
      /* fall through to the legacy single-pair form */
    }
  }

  const legacy = parseFaultSpec({
    stage: process.env.PIPELINE_FAULT_STAGE,
    mode: process.env.PIPELINE_FAULT_MODE,
    delayMs: process.env.PIPELINE_FAULT_DELAY_MS,
  });

  return legacy ? [legacy] : [];
}

/** Backward-compatible single-config accessor (first active fault). */
export function getFaultConfig(): FaultConfig | null {
  return getFaultConfigs()[0] ?? null;
}
