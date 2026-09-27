import {
  researchSkill,
  designPlanningSkill,
  isResearchHandoffReady,
  canInvokeDesignPlanning,
} from "../../packages/agent-runtime/src/index.js";

export interface ExecuteResearchParams {
  intent?: string;
  model?: {
    provider?: string;
    model?: string;
  };
  search?: boolean | {
    enabled?: boolean;
    source?: string;
  };
  source?: string;
}

export interface ExecuteResearchResult {
  ok: boolean;
  status: number;
  error?: string;
  data?: {
    runId: string;
    phase: string;
    stopped: boolean;
    handoffReady: boolean;
    phases: string[];
    bundle: unknown | null;
    issues: unknown[];
  };
}

export interface ExecuteDesignPlanningParams {
  intent?: string;
  researchRun?: any;
  explicitlyInvoked?: boolean;
  repositoryState?: string;
  existingArchitecture?: string;
  existingPhaseReceipts?: any[];
  existingBaselines?: any[];
  researchBundle?: any;
}

export interface ExecuteDesignPlanningResult {
  ok: boolean;
  status: number;
  error?: string;
  phase?: string | null;
  data?: {
    planId: string;
    phase: string;
    auditId?: string;
    stopped: boolean;
    phases: string[];
    issues: unknown[];
  };
}

export class ResearchService {
  /**
   * Executes a governed multi-phase research run. Strictly stops at READY_FOR_PLANNING.
   */
  static async executeGovernedResearch(
    params: ExecuteResearchParams
  ): Promise<ExecuteResearchResult> {
    const intent = (params.intent || "").trim();
    if (!intent) {
      return {
        ok: false,
        status: 400,
        error: "Research intent is required",
      };
    }

    const researchModel = {
      provider: (params.model?.provider || "gemini") as "gemini",
      model: (params.model?.model || process.env.GEMINI_MODEL || "gemini-2.5-flash") as string,
    };

    const isSearchEnabled =
      params.search === true ||
      (typeof params.search === "object" && params.search?.enabled === true);

    const searchSource =
      params.source ||
      (typeof params.search === "object" && params.search?.source) ||
      "tavily";

    const searchConfig = {
      enabled: isSearchEnabled,
      source: searchSource as "tavily",
    };

    try {
      const phases: string[] = [];
      const result = await researchSkill.run({
        intent,
        model: researchModel,
        search: searchConfig,
        onPhase: (phase) => phases.push(phase),
      });

      return {
        ok: true,
        status: 200,
        data: {
          runId: result.run.runId,
          phase: result.run.phase,
          stopped: result.stopped,
          handoffReady: isResearchHandoffReady(result.run),
          phases,
          bundle: result.run.bundle ?? null,
          issues: result.issues,
        },
      };
    } catch (err: any) {
      return {
        ok: false,
        status: 500,
        error: err?.message || "Research run failed",
      };
    }
  }

  /**
   * Executes design planning when explicitly invoked after research handoff.
   */
  static async executeDesignPlanning(
    params: ExecuteDesignPlanningParams
  ): Promise<ExecuteDesignPlanningResult> {
    if (!canInvokeDesignPlanning(params.researchRun ?? null, params.explicitlyInvoked === true)) {
      const pendingHandoff = params.researchRun
        ? " Research has not reached READY_FOR_PLANNING."
        : " Design_Planning must be explicitly invoked (explicitlyInvoked=true).";
      return {
        ok: false,
        status: params.researchRun ? 409 : 400,
        error: pendingHandoff.trim(),
        phase: params.researchRun?.phase ?? null,
      };
    }

    const intent = (params.intent || "").trim();
    if (!intent) {
      return {
        ok: false,
        status: 400,
        error: "Planning intent is required",
      };
    }

    try {
      const phases: string[] = [];
      const result = await designPlanningSkill.plan({
        input: {
          userIntent: intent,
          repositoryState: (params.repositoryState || "").trim(),
          existingArchitecture: (params.existingArchitecture || "").trim(),
          existingPhaseReceipts: Array.isArray(params.existingPhaseReceipts)
            ? params.existingPhaseReceipts
            : [],
          existingBaselines: Array.isArray(params.existingBaselines)
            ? params.existingBaselines
            : [],
          researchBundle: params.researchBundle ?? undefined,
        },
        onPhase: (phase) => phases.push(phase),
      });

      return {
        ok: true,
        status: 200,
        data: {
          planId: result.run.runId,
          phase: result.run.phase,
          auditId: result.run.auditId,
          stopped: result.stopped,
          phases,
          issues: result.issues,
        },
      };
    } catch (err: any) {
      return {
        ok: false,
        status: 500,
        error: err?.message || "Design_Planning failed",
      };
    }
  }
}
