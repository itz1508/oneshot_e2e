/**
 * OneShot Session Ledger
 *
 * Implements session state persistence, checkpoint rewinds, branch forking,
 * and immutable audit hook logs.
 */

import type {
  AuditHookRecord,
  SessionCheckpoint,
  SessionForkResult,
} from "./types.js";

export class SessionLedger {
  private checkpoints: Map<string, SessionCheckpoint> = new Map();
  private auditHooks: AuditHookRecord[] = [];
  private activeSessionId: string;

  constructor(sessionId: string = `session-${Date.now()}`) {
    this.activeSessionId = sessionId;
    this.initDefaultCheckpoints();
  }

  private initDefaultCheckpoints(): void {
    this.createCheckpoint({
      restoreId: "RES-7702-INIT",
      timestamp: "2026-09-22T09:30:00Z",
      title: "Initial Verified Product Architecture",
      agent: "OneShot",
      category: "Architecture",
      payload: {
        stage: "research",
        gates: { gate1: "APPROVED", gate2: "VERIFIED" },
      },
    });

    this.createCheckpoint({
      restoreId: "restore-ui-001",
      timestamp: "2026-09-11T10:42:00Z",
      title: "Frontend and backend direction",
      agent: "OneShot",
      category: "UX/UI",
      payload: {
        concept: "Keep interface familiar while deep processing happens behind conversation",
      },
    });
  }

  getActiveSessionId(): string {
    return this.activeSessionId;
  }

  createCheckpoint(checkpoint: SessionCheckpoint): void {
    this.checkpoints.set(checkpoint.restoreId, checkpoint);
    this.recordAuditHook("on_stage_transition", {
      action: "checkpoint_created",
      restoreId: checkpoint.restoreId,
    });
  }

  getCheckpoint(restoreId: string): SessionCheckpoint | undefined {
    return this.checkpoints.get(restoreId);
  }

  getAllCheckpoints(): SessionCheckpoint[] {
    return Array.from(this.checkpoints.values());
  }

  /**
   * Rewinds session state to a verified checkpoint.
   */
  restoreToCheckpoint(restoreId: string): { success: boolean; checkpoint?: SessionCheckpoint } {
    const cp = this.checkpoints.get(restoreId);
    if (!cp) return { success: false };

    this.recordAuditHook("on_stage_transition", {
      action: "restore_applied",
      restoreId,
    });

    return { success: true, checkpoint: cp };
  }

  /**
   * Forks the conversation from a specific message ID into a new session branch.
   */
  forkBranch(originMessageId: string): SessionForkResult {
    const newSessionId = `session-fork-${Date.now()}`;
    const result: SessionForkResult = {
      forked: true,
      parentSessionId: this.activeSessionId,
      newSessionId,
      originMessageId,
      timestamp: new Date().toISOString(),
    };

    this.recordAuditHook("on_stage_transition", {
      action: "session_forked",
      originMessageId,
      newSessionId,
    });

    return result;
  }

  recordAuditHook(
    hookName: AuditHookRecord["hookName"],
    data: Record<string, unknown>
  ): AuditHookRecord {
    const record: AuditHookRecord = {
      id: `hook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      hookName,
      timestamp: new Date().toISOString(),
      data,
    };
    this.auditHooks.push(record);
    return record;
  }

  getAuditHookLogs(): AuditHookRecord[] {
    return [...this.auditHooks];
  }
}
