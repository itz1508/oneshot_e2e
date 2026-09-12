"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConversationListItem, ConversationSnapshot } from "../lib/contracts";
import { request } from "../lib/http-client";

const STORAGE_KEY = "oneshot-current-conversation-id";

export function useConversation() {
  const [sessions, setSessions] = useState<ConversationListItem[]>([]);
  const [current, setCurrent] = useState<ConversationSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshSessions = useCallback(async () => {
    const data = await request<{ conversations: ConversationListItem[] }>(
      "/api/conversations",
    );
    setSessions(data.conversations ?? []);
  }, []);

  const load = useCallback(
    async (id: string) => {
      const snap = await request<ConversationSnapshot>(`/api/conversations/${id}`);
      setCurrent(snap);
      localStorage.setItem(STORAGE_KEY, id);
      return snap;
    },
    [],
  );

  const start = useCallback(
    async (message: string): Promise<ConversationSnapshot> => {
      setBusy(true);
      try {
        const snap = await request<ConversationSnapshot>("/api/conversations", {
          method: "POST",
          body: JSON.stringify({ message }),
        });
        setCurrent(snap);
        localStorage.setItem(STORAGE_KEY, snap.conversation_id);
        await refreshSessions();
        return snap;
      } finally {
        setBusy(false);
      }
    },
    [refreshSessions],
  );

  const addTurn = useCallback(
    async (message: string): Promise<ConversationSnapshot> => {
      if (!current) throw new Error("No active conversation");
      setBusy(true);
      try {
        const snap = await request<ConversationSnapshot>(
          `/api/conversations/${current.conversation_id}/messages`,
          {
            method: "POST",
            body: JSON.stringify({ message }),
          },
        );
        setCurrent(snap);
        return snap;
      } finally {
        setBusy(false);
      }
    },
    [current],
  );

  const setFixedIntent = useCallback(
    async (enabled: boolean) => {
      if (!current) return;
      const snap = await request<ConversationSnapshot>(
        `/api/conversations/${current.conversation_id}/memory/fixed-intent`,
        {
          method: "POST",
          body: JSON.stringify({ enabled }),
        },
      );
      setCurrent(snap);
      return snap;
    },
    [current],
  );

  const reset = useCallback(() => {
    setCurrent(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    refreshSessions();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      load(saved).catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, [refreshSessions, load]);

  return {
    sessions,
    current,
    busy,
    refreshSessions,
    load,
    start,
    addTurn,
    setFixedIntent,
    reset,
  };
}
