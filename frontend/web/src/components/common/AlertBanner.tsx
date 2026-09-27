import React, { ReactNode } from "react";

export interface AlertBannerProps {
  type?: "warning" | "error" | "info" | "success";
  message?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  type = "warning",
  message,
  children,
  className = "",
}) => {
  const content = children || message;
  if (!content) return null;

  const typeStyles = {
    warning: "border-[#e5a84b]/30 bg-[#e5a84b]/10 text-[#e5a84b]",
    error: "border-red-500/20 bg-red-500/10 text-red-400",
    info: "border-blue-500/20 bg-blue-500/10 text-[#79a8ea]",
    success: "border-[#62c48d]/20 bg-[#62c48d]/10 text-[#62c48d]",
  };

  return (
    <div
      role="alert"
      className={`rounded-lg border p-3 text-xs ${typeStyles[type]} ${className}`.trim()}
    >
      {content}
    </div>
  );
};
