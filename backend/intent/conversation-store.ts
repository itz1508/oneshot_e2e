import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ConversationSnapshot } from "./types.js";

/** Sanitise an ID for safe use as a filename. */
function safe(v: string): string {
  return v.replace(/[^a-zA-Z0-9._-]/g, "_");
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
    this.memory.set(value.conversation_id, value);

    const p = this.path(value.conversation_id);
    if (p) {
      mkdirSync(dirname(p), { recursive: true });
      const tmp = `${p}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
      renameSync(tmp, p);
    }

    return value;
  }

  get(id: string): ConversationSnapshot | undefined {
    const mem = this.memory.get(id);
    if (mem) return mem;

    const p = this.path(id);
    if (p && existsSync(p)) {
      const v = JSON.parse(readFileSync(p, "utf8")) as ConversationSnapshot;
      this.memory.set(id, v);
      return v;
    }

    return undefined;
  }

  require(id: string): ConversationSnapshot {
    const v = this.get(id);
    if (!v) throw new Error(`Unknown conversation ${id}`);
    return v;
  }
}
