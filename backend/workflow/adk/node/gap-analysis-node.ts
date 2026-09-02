import { node, type NodeContext } from "@google/adk";
import type {
  GapAnalysis,
  Plan,
  ResearchBundle,
  ResolvedGap,
} from "../../../contract/types.js";
import { GapAnalysisRole } from "../../../role/gap-analysis/role.js";
import type { GapFinding } from "../../../role/gap-analysis/tool/coverage.js";
import type {
  GapAnalysisWorkflow,
  GapFixResult,
} from "../../../role/gap-analysis/workflow.js";

export interface GapAnalysisNodeInput {
  job_id: string;
  research: ResearchBundle;
  plan: Plan;
  seed_findings?: GapFinding[];
}

export interface GapAnalysisNodeOutput {
  plan: Plan;
  gap: GapAnalysis;
}

function assertJobId(jobId: string): void {
  if (!/[A-Za-z]/.test(jobId)) {
    throw new Error("ADK job_id must contain at least one non-numeric character");
  }
}

function refsFor(plan: Plan, finding: GapFinding): string[] | undefined {
  const step = finding.target_step_id
    ? plan.steps.find((candidate) => candidate.step_id === finding.target_step_id)
    : undefined;
  if (!step) return undefined;
  if (finding.affected_branch === "requirement") return step.requirement_refs;
  if (finding.affected_branch === "goal") return step.goal_refs;
  if (finding.affected_branch === "fixture") return step.fixture_refs;
  return step.schema_refs;
}

function alreadySatisfied(plan: Plan, finding: GapFinding): boolean {
  return refsFor(plan, finding)?.includes(finding.ref_id) ?? false;
}

function assertNoRegression(before: Plan, after: Plan): void {
  if (before.plan_id !== after.plan_id) {
    throw new Error("Gap Analysis changed logical plan_id");
  }
  if (after.revision < before.revision) {
    throw new Error("Gap improvement reduced plan revision");
  }
  const afterSteps = new Map(after.steps.map((step) => [step.step_id, step]));
  for (const previous of before.steps) {
    const current = afterSteps.get(previous.step_id);
    if (!current) throw new Error(`Gap improvement removed step ${previous.step_id}`);
    for (const field of ["requirement_refs", "goal_refs", "fixture_refs", "schema_refs"] as const) {
      const currentRefs = new Set(current[field]);
      for (const ref of previous[field]) {
        if (!currentRefs.has(ref)) {
          throw new Error(`Gap improvement regressed ${field}: ${ref}`);
        }
      }
    }
  }
}

function mergeFindings(seed: GapFinding[], detected: GapFinding[]): GapFinding[] {
  const merged = new Map<string, GapFinding>();
  for (const finding of [...seed, ...detected]) {
    if (!merged.has(finding.key)) merged.set(finding.key, finding);
  }
  return [...merged.values()];
}

/** Connect the existing OneShot GapAnalysisWorkflow to ADK dynamic nodes. */
export function createGapAnalysisNode(gapper: GapAnalysisWorkflow) {
  const checkNode = node(
    (_ctx: NodeContext, input: { research: ResearchBundle; plan: Plan }): GapFinding[] =>
      gapper.inspect(input.research, input.plan),
    { name: `${GapAnalysisRole.id}Check` },
  );

  const fixNode = node(
    (
      _ctx: NodeContext,
      input: { research: ResearchBundle; plan: Plan; finding: GapFinding },
    ): GapFixResult => gapper.resolveOne(input.research, input.plan, input.finding),
    { name: `${GapAnalysisRole.id}Fix` },
  );

  const finalizeNode = node(
    async (
      _ctx: NodeContext,
      input: { plan: Plan; resolved: ResolvedGap[]; rootCause?: GapFixResult["rootCause"] },
    ): Promise<GapAnalysis> => gapper.finalize(input.plan, input.resolved, input.rootCause),
    { name: `${GapAnalysisRole.id}Finalize` },
  );

  return node(
    async (ctx: NodeContext, input: GapAnalysisNodeInput): Promise<GapAnalysisNodeOutput> => {
      assertJobId(input.job_id);
      let plan = input.plan;
      const resolved: ResolvedGap[] = [];
      let pending = (input.seed_findings ?? []).filter((finding) => !alreadySatisfied(plan, finding));
      let iteration = 0;

      for (;;) {
        const checked = await ctx.runNode(
          checkNode,
          { research: input.research, plan },
          { runId: `${input.job_id}-gap-check-${iteration}` },
        );
        pending = pending.filter((finding) => !alreadySatisfied(plan, finding));
        const findings = mergeFindings(pending, checked.output as GapFinding[]);

        if (findings.length === 0) {
          const finalized = await ctx.runNode(
            finalizeNode,
            { plan, resolved },
            { runId: `${input.job_id}-gap-final-${iteration}` },
          );
          return { plan, gap: finalized.output as GapAnalysis };
        }

        const finding = findings[0];
        const before = plan;
        const fixed = await ctx.runNode(
          fixNode,
          { research: input.research, plan, finding },
          { runId: `${input.job_id}-gap-fix-${iteration}` },
        );
        const fix = fixed.output as GapFixResult;
        plan = fix.plan;
        assertNoRegression(before, plan);

        if (fix.rootCause) {
          const finalized = await ctx.runNode(
            finalizeNode,
            { plan, resolved, rootCause: fix.rootCause },
            { runId: `${input.job_id}-gap-root-${iteration}` },
          );
          return { plan, gap: finalized.output as GapAnalysis };
        }
        if (!fix.resolved) {
          throw new Error(`Gap Analysis produced no improvement for ${finding.key}`);
        }
        resolved.push(fix.resolved);
        pending = pending.filter((candidate) => candidate.key !== finding.key);
        iteration += 1;
        if (iteration > 256) {
          throw new Error("Gap Analysis exceeded deterministic refinement bound");
        }
      }
    },
    { name: GapAnalysisRole.id, rerunOnResume: true },
  );
}
