/**
 * OneShot Session Ledger & Audit Types
 */

export interface SessionCheckpoint {
  restoreId: string;
  timestamp: string;
  title: string;
  agent: string;
  category: string;
  payload: Record<string, unknown>;
}

export interface SessionForkResult {
  forked: boolean;
  parentSessionId: string;
  newSessionId: string;
  originMessageId: string;
  timestamp: string;
}

export interface AuditHookRecord {
  id: string;
  hookName: "on_stream_start" | "on_tool_start" | "on_tool_finish" | "on_gate_check" | "on_stage_transition";
  timestamp: string;
  data: Record<string, unknown>;
}
