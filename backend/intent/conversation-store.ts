import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ConversationSnapshot } from "./types.js";
import { MemoryService } from "../memory/memory-service.js";

/** Sanitise an ID for safe use as a filename. */
function safe(v: string): string {
  return v.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export interface ConversationListItem {
  conversation_id: string;
  session_id: string;
  title: string;
  updated_at: string;
}

/**
 * Disk-persistent + in-memory cache of conversation snapshots.
 * Writes are atomic via tmp-file + rename to prevent partial reads.
 */
export class ConversationStore {
  private memory = new Map<string, ConversationSnapshot>();

  constructor(private root?: string) {
    if (root) mkdirSync(root, { recursive: true });
  }

  private path(id: string): string | undefined {
    return this.root ? join(this.root, `${safe(id)}.json`) : undefined;
  }

  save(value: ConversationSnapshot): ConversationSnapshot {
    const normalized: ConversationSnapshot = {
      ...value,
      memory: MemoryService.normalize(value.memory),
    };
    this.memory.set(value.conversation_id, normalized);

    const p = this.path(value.conversation_id);
    if (p) {
      mkdirSync(dirname(p), { recursive: true });
      const tmp = `${p}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(normalized, null, 2) + "\n", "utf8");
      renameSync(tmp, p);
    }

    return normalized;
  }

  get(id: string): ConversationSnapshot | undefined {
    const mem = this.memory.get(id);
    if (mem) return mem;

    const p = this.path(id);
    if (p && existsSync(p)) {
      const v = JSON.parse(readFileSync(p, "utf8")) as ConversationSnapshot;
      const normalized: ConversationSnapshot = {
        ...v,
        memory: MemoryService.normalize(v.memory),
      };
      this.memory.set(id, normalized);
      return normalized;
    }

    return undefined;
  }

  require(id: string): ConversationSnapshot {
    const v = this.get(id);
    if (!v) throw new Error(`Unknown conversation ${id}`);
    return v;
  }

  list(): ConversationListItem[] {
    const items: ConversationListItem[] = [];
    const seen = new Set<string>();

    // In-memory entries first.
    for (const snap of this.memory.values()) {
      items.push({
        conversation_id: snap.conversation_id,
        session_id: snap.session_id,
        title: deriveTitle(snap),
        updated_at: snap.updated_at,
      });
      seen.add(snap.conversation_id);
    }

    // Then persisted files not already in memory.
    if (this.root && existsSync(this.root)) {
      for (const entry of readdirSync(this.root, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const fileConversationId = entry.name.replace(/\.json$/, "");
        const snap = this.get(fileConversationId);
        if (!snap) continue;
        if (seen.has(snap.conversation_id)) continue;
        items.push({
          conversation_id: snap.conversation_id,
          session_id: snap.session_id,
          title: deriveTitle(snap),
          updated_at: snap.updated_at,
        });
        seen.add(snap.conversation_id);
      }
    }

    return items.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }
}

function deriveTitle(snap: ConversationSnapshot): string {
  const firstUser = snap.turns.find((t) => t.user_message?.trim());
  const text = (firstUser?.user_message ?? "New conversation").trim();
  if (!text) return "New conversation";
  const firstLine = text.split("\n")[0].trim();
  if (!firstLine) return "New conversation";
  const cleaned = firstLine.replace(/^[\s>#\-•]+/, "");
  const max = 80;
  if (cleaned.length <= max) return cleaned;
  const truncated = cleaned.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + "…";
}
