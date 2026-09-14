import type { SourceDoc } from "../../types";

export type RunEvent =
  | { type: "status"; text: string }
  | { type: "token"; text: string }
  | { type: "tool_start"; toolId: string; name: string; input?: unknown }
  | { type: "tool_progress"; toolId: string; text: string }
  | { type: "tool_end"; toolId: string; outputSummary?: string; error?: string }
  | { type: "sources"; sources: SourceDoc[] }
  | { type: "done"; usage?: unknown; durationSec?: number }
  | { type: "interrupted" }
  | { type: "error"; code: string; message: string; action?: string };
