import type { ConversationSnapshot } from "../intent/types.js";

export function projectConversationContext(snap: ConversationSnapshot): string[] {
  const memory = snap.memory ?? {
    fixed_intent_enabled: false,
    records: [],
    summaries: [],
    sections: [],
  };

  if (!memory.fixed_intent_enabled) {
    return snap.turns.map((t) => t.user_message.trim()).filter(Boolean);
  }

  const summarizedTurnIds = new Set<string>();
  const context: string[] = [];

  for (const summary of memory.summaries) {
    if (summary.body) context.push(summary.body);
    for (const recordId of summary.source_record_ids) {
      const record = memory.records.find((r) => r.record_id === recordId);
      if (record) summarizedTurnIds.add(record.turn_id);
    }
  }

  for (const turn of snap.turns) {
    if (!summarizedTurnIds.has(turn.turn_id)) {
      const text = turn.user_message.trim();
      if (text) context.push(text);
    }
  }

  return [...new Set(context)];
}
