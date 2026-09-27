import React from "react";

export interface StatusBadgeProps {
  status: string;
  tone?: "blue" | "amber" | "green" | "gray" | "red";
  label?: string;
  pulse?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  tone,
  label,
  pulse = false,
  className = "",
}) => {
  const resolvedTone =
    tone ||
    (status === "ready" || status === "CONFIRMED" || status === "active"
      ? "green"
      : status === "running" || status === "in_progress" || status === "pending"
      ? "amber"
      : status === "review_needed"
      ? "amber"
      : status === "failed" || status === "error"
      ? "red"
      : "gray");

  const toneClasses: Record<string, string> = {
    green: "bg-[#62c48d]/10 text-[#62c48d] border-[#62c48d]/20",
    amber: "bg-[#e5a84b]/15 text-[#e5a84b] border-[#e5a84b]/30",
    blue: "bg-blue-500/10 text-[#79a8ea] border-blue-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    gray: "bg-white/5 text-[#8e8e93] border-white/10",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${
        toneClasses[resolvedTone]
      } ${pulse ? "animate-pulse" : ""} ${className}`.trim()}
    >
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {label || status}
    </span>
  );
};
