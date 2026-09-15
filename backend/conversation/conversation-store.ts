/**
 * M14: Durable conversation store. File-based with atomic writes,
 * matching the existing ConversationStore pattern. Conversations
 * survive page reload via disk persistence.
 */
import {
  existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Conversation } from "./types.js";

function safe(v: string): string {
  return v.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class ConversationStore {
  private memory = new Map<string, Conversation>();
  constructor(private root?: string) {
    if (root) mkdirSync(root, { recursive: true });
  }
  private path(id: string): string | undefined {
    return this.root ? join(this.root, `${safe(id)}.json`) : undefined;
  }
  save(conv: Conversation): Conversation {
    this.memory.set(conv.conversationId, conv);
    const p = this.path(conv.conversationId);
    if (p) {
      mkdirSync(dirname(p), { recursive: true });
      const tmp = `${p}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(conv, null, 2) + "\n", "utf8");
      renameSync(tmp, p);
    }
    return conv;
  }
  get(id: string): Conversation | undefined {
    const mem = this.memory.get(id);
    if (mem) return mem;
    const p = this.path(id);
    if (p && existsSync(p)) {
      const v = JSON.parse(readFileSync(p, "utf8")) as Conversation;
      this.memory.set(id, v);
      return v;
    }
    return undefined;
  }
  list(): Conversation[] {
    return [...this.memory.values()];
  }
  delete(id: string): void {
    this.memory.delete(id);
  }
}
