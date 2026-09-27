import path from "node:path";
import fs from "node:fs/promises";
import type {
  OneShotWorkflowEngine,
  SessionLedger,
  TodoChainManager,
  WorkflowStage,
} from "../../packages/agent-runtime/src/index.js";

export const VALID_WORKFLOW_STAGES = [
  "research",
  "planning",
  "gap_analysis",
  "evaluation",
  "builder",
] as const;

export interface ConfirmGateResult {
  ok: boolean;
  status: number;
  error?: string;
  received?: string | null;
  result?: {
    gateId: string;
    name: string;
    status: string;
    confirmedAt?: string;
    confirmedBy?: string;
    packageHash: string | null;
  };
}

export interface TransitionStageResult {
  ok: boolean;
  status: number;
  error?: string;
  received?: unknown;
  result?: {
    ok: boolean;
    fromStage?: string;
    toStage?: string;
    error?: string;
  };
}

export class WorkflowService {
  /**
   * Derives real pipeline stage statuses from authoritative engine state.
   */
  static getPipelineStages(workflowEngine: OneShotWorkflowEngine) {
    const gate1 = workflowEngine.getGate1();
    const gate2 = workflowEngine.getGate2();
    const currentStage = workflowEngine.getCurrentStage();

    const ENGINE_ORDER = ["research", "planning", "gap_analysis", "evaluation", "builder"];
    const currentIndex = ENGINE_ORDER.indexOf(currentStage);

    const ENGINE_FOR: Record<string, string | null> = {
      research: "research",
      planning: "planning",
      gap: "gap_analysis",
      evaluation: "evaluation",
      build: "builder",
      refactor: null,
    };

    const statusFor = (displayId: string): string => {
      const engineStage = ENGINE_FOR[displayId];
      if (engineStage === null) return "waiting";
      const index = ENGINE_ORDER.indexOf(engineStage);
      if (index === currentIndex) return "active";
      return index < currentIndex ? "completed" : "waiting";
    };

    return {
      currentStage,
      stages: [
        {
          id: "research",
          name: "Research & Explore",
          status: statusFor("research"),
          kind: "run",
          todos: [
            "Understand user prompt requirements",
            "Formulate search queries",
            "Index primary documentation sources",
          ],
        },
        {
          id: "review",
          name: "Gate 1: Research Review",
          status: gate1.status === "CONFIRMED" ? "confirmed" : "pending",
          kind: "pause",
          todos: ["Present findings and evidence", "Obtain human confirmation before planner"],
        },
        {
          id: "planning",
          name: "Plan Architecture",
          status: statusFor("planning"),
          kind: "run",
          todos: ["Validate schema contracts", "Verify partition boundaries", "Generate atomic plan package"],
        },
        {
          id: "refactor",
          name: "Refactor Strategy",
          status: statusFor("refactor"),
          kind: "run",
          todos: ["Audit imports and caller graph", "Preserve public exports"],
        },
        {
          id: "gap",
          name: "Gap Analysis",
          status: statusFor("gap"),
          kind: "run",
          todos: ["Reconcile active code against source of truth", "Enforce invariant contracts"],
        },
        {
          id: "evaluation",
          name: "Evaluation & Tests",
          status: statusFor("evaluation"),
          kind: "run",
          todos: ["Execute unit tests", "Run browser E2E verification"],
        },
        {
          id: "build_ready",
          name: "Gate 2: Build Ready",
          status: gate2.status === "CONFIRMED" ? "confirmed" : "waiting",
          kind: "pause",
          todos: ["Hash confirmed core representation", "Obtain human authorization for build"],
        },
        {
          id: "build",
          name: "Builder & Output",
          status: statusFor("build"),
          kind: "run",
          todos: ["Apply certified patches", "Verify static export bundle"],
        },
      ],
    };
  }

  /**
   * Confirms human invariant gates (Gate 1 or Gate 2).
   */
  static confirmGate(
    workflowEngine: OneShotWorkflowEngine,
    sessionLedger: SessionLedger,
    gateId?: string,
    packageCore?: unknown
  ): ConfirmGateResult {
    const targetGate = gateId ?? "gate-1";

    if (targetGate !== "gate-1" && targetGate !== "gate-2") {
      return {
        ok: false,
        status: 400,
        error: "Unknown gate. Expected 'gate-1' or 'gate-2'.",
        received: targetGate,
      };
    }

    if (targetGate === "gate-2" && (packageCore === undefined || packageCore === null)) {
      return {
        ok: false,
        status: 400,
        error: "Gate 2 confirmation requires a 'packageCore' object to bind the SHA-256 hash.",
      };
    }

    const confirmed =
      targetGate === "gate-1"
        ? workflowEngine.confirmGate1("user")
        : workflowEngine.confirmGate2(packageCore as Record<string, unknown>, "user");

    sessionLedger.recordAuditHook("on_gate_check", {
      gateId: confirmed.gateId,
      status: confirmed.status,
      confirmedAt: confirmed.confirmedAt,
      packageHash: confirmed.packageHash,
    });

    return {
      ok: true,
      status: 200,
      result: {
        gateId: confirmed.gateId,
        name: confirmed.name,
        status: confirmed.status,
        confirmedAt: confirmed.confirmedAt,
        confirmedBy: confirmed.confirmedBy,
        packageHash: confirmed.packageHash ?? null,
      },
    };
  }

  /**
   * Transitions engine stage with strict enum validation.
   */
  static transitionStage(
    workflowEngine: OneShotWorkflowEngine,
    requested?: unknown
  ): TransitionStageResult {
    if (
      typeof requested !== "string" ||
      !VALID_WORKFLOW_STAGES.includes(requested as (typeof VALID_WORKFLOW_STAGES)[number])
    ) {
      return {
        ok: false,
        status: 400,
        error: `transitionStage requires targetStage. Valid: ${VALID_WORKFLOW_STAGES.join(", ")}.`,
        received: requested ?? null,
      };
    }

    const targetStage = requested as WorkflowStage;
    const transitionRes = workflowEngine.transitionTo(targetStage);

    return {
      ok: transitionRes.success,
      status: 200,
      result: {
        ok: transitionRes.success,
        fromStage: transitionRes.fromStage,
        toStage: transitionRes.toStage,
        error: transitionRes.error,
      },
    };
  }

  /**
   * Exports full state snapshot bundle.
   */
  static async exportBundle(
    workflowEngine: OneShotWorkflowEngine,
    sessionLedger: SessionLedger,
    todoManager: TodoChainManager
  ) {
    let manifestData: unknown = null;
    try {
      const manifestPath = path.resolve(process.cwd(), "app/manifest.json");
      const raw = await fs.readFile(manifestPath, "utf-8");
      manifestData = JSON.parse(raw);
    } catch {
      manifestData = { version: "1.3.0", files: 0, commit: "local" };
    }

    return {
      version: "1.3.0",
      exportedAt: new Date().toISOString(),
      name: "OneShot E2E Bundle",
      manifest: manifestData,
      workflow: {
        currentStage: workflowEngine.getCurrentStage(),
        gate1: workflowEngine.getGate1(),
        gate2: workflowEngine.getGate2(),
      },
      items: {
        checkpoints: sessionLedger.getAllCheckpoints?.() || [],
        todos: todoManager.getActiveOnlySnapshot?.() || [],
      },
    };
  }

  /**
   * Ingests bundle data and restores workflow stage.
   */
  static importBundle(
    workflowEngine: OneShotWorkflowEngine,
    bundleData: any,
    sessionId: string
  ) {
    if (bundleData.workflow?.currentStage) {
      workflowEngine.transitionTo(bundleData.workflow.currentStage);
    }

    const checkpointsCount = bundleData.items?.checkpoints?.length || 0;
    const todosCount = bundleData.items?.todos?.length || 0;

    return {
      id: sessionId,
      restoredStage: workflowEngine.getCurrentStage(),
      checkpointCount: checkpointsCount,
      todoCount: todosCount,
      manifestVersion: bundleData.manifest?.version || "1.3.0",
    };
  }
}
