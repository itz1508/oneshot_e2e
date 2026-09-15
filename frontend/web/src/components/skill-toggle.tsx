"use client";

import { useCallback } from "react";
import { useSkills } from "../lib/skills";
import type { SkillListItem } from "../lib/skills";

export interface SkillToggleProps {
  skill: SkillListItem;
  conversationId: string;
}

export function SkillToggle({ skill, conversationId }: SkillToggleProps) {
  const { active, toggle, isPending } = useSkills(skill.id, conversationId);

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      toggle(event.target.checked, skill.defaultGroups);
    },
    [toggle, skill.defaultGroups],
  );

  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderRadius: 6,
        border: "1px solid var(--line-subtle)",
        padding: 10,
        cursor: skill.available ? "pointer" : "not-allowed",
        opacity: skill.available ? 1 : 0.6,
      }}
    >
      <input
        type="checkbox"
        checked={active?.skillId === skill.id}
        onChange={onChange}
        disabled={!skill.available || isPending}
        style={{ width: 16, height: 16 }}
        aria-label={`Activate ${skill.name}`}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{skill.name}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{skill.description}</span>
        {!skill.available && (
          <span style={{ fontSize: 11, color: "var(--accent-rose)" }}>
            Unavailable in this deployment
          </span>
        )}
      </div>
    </label>
  );
}
