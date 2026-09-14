import type { ChatMessage, ProviderSettings, SessionMeta } from "../../types";

export interface ChatStorage {
  listSessions(): Promise<SessionMeta[]>;
  getSession(id: string): Promise<SessionWithMessages | null>;
  saveSession(session: SessionWithMessages): Promise<void>;
  deleteSession(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface SessionWithMessages extends SessionMeta {
  messages: ChatMessage[];
}

export function newSessionMeta(agentId: string, runtimeMode: ProviderSettings["runtimeMode"]): SessionMeta {
  const now = Date.now();
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    agentId,
    runtimeMode,
  };
}

export function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New chat";
  const text = first.content.trim();
  return text.length > 40 ? `${text.slice(0, 40)}…` : text || "New chat";
}

export async function createChatStorage(): Promise<ChatStorage> {
  // TODO: replace with MongoDB/Atlas persistence or existing backend storage.
  const DB_NAME = "OneShotResearcher";
  const STORE_NAME = "sessions";

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      resolve({
        async listSessions() {
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const all = await new Promise<SessionWithMessages[]>((res, rej) => {
            const q = store.getAll();
            q.onsuccess = () => res(q.result as SessionWithMessages[]);
            q.onerror = () => rej(q.error);
          });
          return all
            .map((s) => ({
              id: s.id,
              title: s.title,
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
              agentId: s.agentId,
              runtimeMode: s.runtimeMode,
            }))
            .sort((a, b) => b.updatedAt - a.updatedAt);
        },
        async getSession(id) {
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          return new Promise((res, rej) => {
            const q = store.get(id);
            q.onsuccess = () => res((q.result as SessionWithMessages | undefined) ?? null);
            q.onerror = () => rej(q.error);
          });
        },
        async saveSession(session) {
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          await new Promise<void>((res, rej) => {
            const q = store.put(session);
            q.onsuccess = () => res();
            q.onerror = () => rej(q.error);
          });
        },
        async deleteSession(id) {
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          await new Promise<void>((res, rej) => {
            const q = store.delete(id);
            q.onsuccess = () => res();
            q.onerror = () => rej(q.error);
          });
        },
        async clearAll() {
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          await new Promise<void>((res, rej) => {
            const q = store.clear();
            q.onsuccess = () => res();
            q.onerror = () => rej(q.error);
          });
        },
      });
    };
  });
}
