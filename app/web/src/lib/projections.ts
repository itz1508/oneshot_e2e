import type { ConversationTurn, MemoryRecord, FixedIntentSummary } from "./contracts";

export function deriveTurnTitle(turn: ConversationTurn, fallback?: number): string {
  const text = turn.user_message.trim();
  if (!text) return "Empty turn";
  const firstLine = text.split("\n")[0].trim().replace(/^[\s>#\-•]+/, "");
  if (!firstLine) return "Empty turn";
  const max = fallback ?? 80;
  if (firstLine.length <= max) return firstLine;
  const truncated = firstLine.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

export function deriveRecordTitle(record: MemoryRecord): string {
  const text = record.text.trim();
  if (!text) return "Empty record";
  const firstLine = text.split("\n")[0].trim().replace(/^[\s>#\-•]+/, "");
  if (!firstLine) return "Empty record";
  const max = 80;
  if (firstLine.length <= max) return firstLine;
  const truncated = firstLine.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

export function deriveSummaryTitle(
  summary: FixedIntentSummary,
  index: number,
): string {
  const body = summary.body.trim();
  if (body) {
    const firstLine = body.split("\n")[0].trim().replace(/^[\s>#\-•]+/, "");
    if (firstLine && firstLine.length <= 80) return firstLine;
    if (firstLine) {
      const truncated = firstLine.slice(0, 80);
      const lastSpace = truncated.lastIndexOf(" ");
      return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "…";
    }
  }
  return `Section ${index + 1}`;
}
