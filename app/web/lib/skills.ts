/**
 * Client-side skill state. Stores only activation state per conversation;
 * credentials and model endpoints live server-side.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { request } from "./http-client";

export type SkillGroup =
  | "vision"
  | "generate"
  | "action"
  | "curate"
  | "deploy"
  | "evaluate"
  | "system";

export interface SkillListItem {
  id: string;
  name: string;
  description: string;
  available: boolean;
  defaultGroups: SkillGroup[];
  activeGroups: SkillGroup[];
}

export interface SkillActivationState {
  skillId: string;
  groups: SkillGroup[];
}

interface SkillsListResponse {
  skills: SkillListItem[];
}

export function useSkills(skillId: string, conversationId: string) {
  const [active, setActive] = useState<SkillActivationState | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    request<SkillActivationState | null>(
      `/api/skills/${encodeURIComponent(skillId)}?conversationId=${encodeURIComponent(conversationId)}`,
    )
      .then((data) => {
        if (!cancelled) setActive(data);
      })
      .catch(() => {
        if (!cancelled) setActive(null);
      });
    return () => {
      cancelled = true;
    };
  }, [skillId, conversationId]);

  const toggle = useCallback(
    async (enabled: boolean, groups: SkillGroup[]) => {
      setIsPending(true);
      try {
        if (enabled) {
          const data = await request<SkillActivationState>(
            `/api/skills/${encodeURIComponent(skillId)}/activate`,
            { conversationId, groups },
          );
          setActive(data);
        } else {
          await request(`/api/skills/${encodeURIComponent(skillId)}/deactivate`, {
            conversationId,
          });
          setActive(null);
        }
      } finally {
        setIsPending(false);
      }
    },
    [skillId, conversationId],
  );

  return { active, toggle, isPending };
}

export function useSkillsList(conversationId: string) {
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    request<SkillsListResponse>(
      `/api/skills?conversationId=${encodeURIComponent(conversationId)}`,
    )
      .then((data) => {
        if (!cancelled) setSkills(data.skills ?? []);
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return { skills, isLoading };
}
