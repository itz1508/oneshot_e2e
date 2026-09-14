"use client";

import { useSkillsList } from "../lib/skills";
import { SkillToggle } from "./skill-toggle";

export function SkillPanel({ conversationId }: { conversationId: string }) {
  const { skills, isLoading } = useSkillsList(conversationId);

  if (isLoading) return <div style={{ color: "var(--text-muted)" }}>Loading skills…</div>;

  return (
    <section aria-label="Skills" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Skills are inactive by default. Check the box to activate a skill for this conversation.
      </p>
      {skills.map((skill) => (
        <SkillToggle key={skill.id} skill={skill} conversationId={conversationId} />
      ))}
    </section>
  );
}
