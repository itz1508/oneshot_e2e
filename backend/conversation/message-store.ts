/**
 * M14: Durable message store. Messages are persisted per conversation
 * with stable sequence numbers for ordering. Partial messages
 * (status: "streaming") are recoverable on reload.
 *
 * Credentials and hidden reasoning are never stored — only the
 * user-visible `content` and `status` are persisted.
 */
import {
  existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { ConversationMessage, MessageStatus } from "./types.js";

function safe(v: string): string {
  return v.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class MessageStore {
  private memory = new Map<string, ConversationMessage[]>();
  private sequences = new Map<string, number>();
  constructor(private root?: string) {
    if (root) mkdirSync(root, { recursive: true });
  }
  private path(conversationId: string): string | undefined {
    return this.root ? join(this.root, `${safe(conversationId)}.messages.json`) : undefined;
  }
  private load(conversationId: string): ConversationMessage[] {
    const mem = this.memory.get(conversationId);
    if (mem) return mem;
    const p = this.path(conversationId);
    if (p && existsSync(p)) {
      const v = JSON.parse(readFileSync(p, "utf8")) as ConversationMessage[];
      this.memory.set(conversationId, v);
      const maxSeq = v.reduce((m, x) => Math.max(m, x.sequence), 0);
      this.sequences.set(conversationId, maxSeq);
      return v;
    }
    const fresh: ConversationMessage[] = [];
    this.memory.set(conversationId, fresh);
    this.sequences.set(conversationId, 0);
    return fresh;
  }
  private persist(conversationId: string, msgs: ConversationMessage[]): void {
    const p = this.path(conversationId);
    if (!p) return;
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(msgs, null, 2) + "\n", "utf8");
    renameSync(tmp, p);
  }
  add(msg: Omit<ConversationMessage, "sequence" | "createdAt" | "updatedAt"> & {
    sequence?: number; createdAt?: string; updatedAt?: string;
  }): ConversationMessage {
    const msgs = this.load(msg.conversationId);
    const seq = msg.sequence ?? (this.sequences.get(msg.conversationId) ?? 0) + 1;
    this.sequences.set(msg.conversationId, seq);
    const now = new Date().toISOString();
    const full: ConversationMessage = {
      ...msg,
      sequence: seq,
      createdAt: msg.createdAt ?? now,
      updatedAt: msg.updatedAt ?? now,
    };
    msgs.push(full);
    this.persist(msg.conversationId, msgs);
    return full;
  }
  update(conversationId: string, messageId: string, updates: {
    content?: string; status?: MessageStatus;
  }): ConversationMessage | undefined {
    const msgs = this.load(conversationId);
    const msg = msgs.find((m) => m.messageId === messageId);
    if (!msg) return undefined;
    if (updates.content !== undefined) msg.content = updates.content;
    if (updates.status !== undefined) msg.status = updates.status;
    msg.updatedAt = new Date().toISOString();
    this.persist(conversationId, msgs);
    return msg;
  }
  list(conversationId: string): ConversationMessage[] {
    return [...this.load(conversationId)].sort((a, b) => a.sequence - b.sequence);
  }
  get(conversationId: string, messageId: string): ConversationMessage | undefined {
    return this.load(conversationId).find((m) => m.messageId === messageId);
  }
  /** Recover partial (streaming) messages — return them for replay. */
  recoverPartial(conversationId: string): ConversationMessage[] {
    return this.list(conversationId).filter((m) => m.status === "streaming");
  }
  delete(conversationId: string): void {
    this.memory.delete(conversationId);
    this.sequences.delete(conversationId);
  }
}
