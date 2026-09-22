import type { ReactNode } from "react";

interface SplitViewProps {
  main: ReactNode;
  sidebar: ReactNode;
  sidebarWidth?: number;
}

export function SplitView({ main, sidebar, sidebarWidth = 320 }: SplitViewProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{main}</div>
      <div
        className="min-h-0 overflow-y-auto border-l border-border"
        style={{ width: `${sidebarWidth}px` }}
      >
        {sidebar}
      </div>
    </div>
  );
}
