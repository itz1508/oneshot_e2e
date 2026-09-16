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

  /** Save with hash computation for workflow gate validation. */
  saveWithHash(value: ConversationSnapshot, computeHash?: (snap: ConversationSnapshot) => string): ConversationSnapshot {
    // Compute hash if not already present
    if (!value.conversation_hash && computeHash) {
      value.conversation_hash = computeHash(value);
    }
    return this.save(value);
  }

  /** Validate conversation hash for workflow gate (M14). */
  validateHash(conversationId: string, expectedHash: string): boolean {
    const snap = this.get(conversationId);
    if (!snap) return false;
    if (!snap.conversation_hash) return false;
    return snap.conversation_hash === expectedHash;
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

  /** List all conversation IDs in the store. */
  listIds(): string[] {
    // Return in-memory IDs first, then scan disk for any not loaded
    const ids = [...this.memory.keys()];
    if (this.root) {
      try {
        const files = readdirSync(this.root);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const id = file.replace(/\.json$/, "").replace(/_/g, ":");
            if (!ids.includes(id)) {
              ids.push(id);
            }
          }
        }
      } catch (e) {
        // Directory doesn't exist or isn't readable, return in-memory only
      }
    }
    return ids;
  }

  /** List all conversations with metadata (lightweight projection). */
  list(): Array<{ conversation_id: string; created_at: string; updated_at: string }> {
    const ids = this.listIds();
    return ids.map((id) => {
      const snap = this.get(id);
      if (snap) {
        return {
          conversation_id: snap.conversation_id,
          created_at: snap.created_at,
          updated_at: snap.updated_at,
        };
      }
      // Fallback for disk-only entries not yet loaded
      return {
        conversation_id: id,
        created_at: "",
        updated_at: "",
      };
    });
  }
}
