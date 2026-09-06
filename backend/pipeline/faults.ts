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
  | "hash";

export type FaultMode =
  | "none"
  | "fail-once"
  | "fail-always"
  | "delay"
  | "crash";

export interface FaultConfig {
  stage: FaultStage;
  mode: FaultMode;
  delayMs?: number;
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

export function getFaultConfig(): FaultConfig | null {
  if (!faultsEnabled()) {
    return null;
  }

  const stage = process.env.PIPELINE_FAULT_STAGE
    ?.trim()
    .toLowerCase() as FaultStage | undefined;

  const mode = process.env.PIPELINE_FAULT_MODE
    ?.trim()
    .toLowerCase() as FaultMode | undefined;

  if (!stage || !mode) {
    return null;
  }

  return {
    stage,
    mode,
    delayMs: Number(
      process.env.PIPELINE_FAULT_DELAY_MS ?? 3000,
    ),
  };
}
