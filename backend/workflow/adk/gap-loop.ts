import { LoopAgent, SequentialAgent } from "@google/adk";
import type { RolePipeline } from "../../pipeline/role-pipeline.js";
import { ADK_STATE, state } from "./state.js";
import { OneShotStageAgent, rootCauseDelta } from "./stage-agent.js";

export interface GapLoopEffects {
  event(
    runId: string,
    processor: string,
    state: "PENDING" | "RUNNING" | "COMPLETE",
    data?: Record<string, unknown>,
  ): void;
  save(runId: string, name: string, value: unknown): Promise<string>;
}

/** Build the canonical ADK Gap Analysis workflow. */
export function createGapAnalysisAgent(
  pipeline: RolePipeline,
  effects: GapLoopEffects,
): SequentialAgent {
  const start = new OneShotStageAgent({
    name: "GapAnalysisStart",
    description: "Activates and starts canonical Gap Analysis.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      await pipeline.activate(runId, "GapAnalysis");
      effects.event(runId, "GapAnalysis", "RUNNING");
      return {
        stateDelta: {
          [ADK_STATE.resolvedGaps]: [],
          [ADK_STATE.gapFindings]: [],
        },
      };
    },
  });

  const check = new OneShotStageAgent({
    name: "GapCheck",
    description: "Detects current deterministic plan gaps.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      const gapper = pipeline.require(runId, "GapAnalysis");
      return {
        stateDelta: {
          [ADK_STATE.gapFindings]: gapper.inspect(
            state.bundle(ctx),
            state.plan(ctx),
          ),
        },
      };
    },
  });

  const fix = new OneShotStageAgent({
    name: "GapFix",
    description: "Fixes one deterministic gap per LoopAgent iteration.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      const gapper = pipeline.require(runId, "GapAnalysis");
      const findings = state.gapFindings(ctx);
      if (findings.length === 0) return;

      const beforeKeys = new Set(findings.map((finding) => finding.key));
      const fixed = gapper.resolveOne(
        state.bundle(ctx),
        state.plan(ctx),
        findings[0],
      );

      if (fixed.rootCause) {
        return {
          stateDelta: {
            [ADK_STATE.plan]: fixed.plan,
            ...rootCauseDelta(fixed.rootCause),
          },
        };
      }

      const remaining = gapper.inspect(state.bundle(ctx), fixed.plan);
      const afterKeys = new Set(remaining.map((finding) => finding.key));
      const introducedNewGap = [...afterKeys].some(
        (key) => !beforeKeys.has(key),
      );
      const progressed =
        afterKeys.size < beforeKeys.size && !introducedNewGap;

      if (!progressed) {
        return {
          stateDelta: {
            [ADK_STATE.plan]: fixed.plan,
            ...rootCauseDelta({
              issue: "Gap Analysis violated deterministic progress invariant",
              expected:
                "Each LoopAgent iteration removes at least one existing gap and introduces no new gap key",
              actual: `before=${[...beforeKeys].join(",")}; after=${[
                ...afterKeys,
              ].join(",")}`,
              evidence_ids: state.bundle(ctx).researcher.evidence.map(
                (e) => e.evidence_id,
              ),
              required_correction:
                "Correct the deterministic gap target or fix rule",
              recheck_target: fixed.plan.plan_id,
            }),
          },
        };
      }

      return {
        stateDelta: {
          [ADK_STATE.plan]: fixed.plan,
          [ADK_STATE.resolvedGaps]: fixed.resolved
            ? [...state.resolvedGaps(ctx), fixed.resolved]
            : state.resolvedGaps(ctx),
        },
      };
    },
  });

  const recheck = new OneShotStageAgent({
    name: "GapRecheck",
    description:
      "Rechecks the finite gap set and exits LoopAgent on gap_0 or ROOT_CAUSE.",
    runAfterRootCause: true,
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      const gapper = pipeline.require(runId, "GapAnalysis");
      const rootCause = state.rootCause(ctx);
      const plan = state.plan(ctx);
      const resolved = state.resolvedGaps(ctx);

      if (rootCause) {
        const gap = await gapper.finalize(plan, resolved, rootCause);
        return {
          escalate: true,
          stateDelta: { [ADK_STATE.gap]: gap },
        };
      }

      const remaining = gapper.inspect(state.bundle(ctx), plan);
      if (remaining.length === 0) {
        const gap = await gapper.finalize(plan, resolved);
        return {
          escalate: true,
          stateDelta: {
            [ADK_STATE.gap]: gap,
            [ADK_STATE.gapFindings]: [],
          },
        };
      }

      return {
        stateDelta: { [ADK_STATE.gapFindings]: remaining },
      };
    },
  });

  const loop = new LoopAgent({
    name: "GapAnalysisLoop",
    description:
      "Repeats deterministic gap check, one-gap fix, and recheck until gap_0 or ROOT_CAUSE.",
    subAgents: [check, fix, recheck],
  });

  const complete = new OneShotStageAgent({
    name: "GapAnalysisComplete",
    description: "Persists the terminal canonical Gap Analysis result.",
    runAfterRootCause: true,
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      const gap = state.gap(ctx);
      const plan = state.plan(ctx);
      const bundle = { ...state.bundle(ctx), plan };

      await effects.save(runId, "plan.gap", plan);
      await effects.save(runId, "gap", gap);
      effects.event(runId, "GapAnalysis", "COMPLETE", {
        result: gap.result,
        artifact_id: gap.plan_id,
        message: `gap_0=${gap.gap_0}; resolved=${gap.resolved_gaps.length}`,
      });

      return {
        stateDelta: {
          [ADK_STATE.bundle]: bundle,
          ...(gap.root_cause ? rootCauseDelta(gap.root_cause) : {}),
        },
      };
    },
  });

  return new SequentialAgent({
    name: "GapAnalysisWorkflow",
    description:
      "Runs canonical Gap Analysis with a real ADK LoopAgent until gap_0.",
    subAgents: [start, loop, complete],
  });
}
