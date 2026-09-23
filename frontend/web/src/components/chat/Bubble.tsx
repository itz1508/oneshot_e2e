import type { ReactNode } from "react";

function BotIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}

function SparklesIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

interface BubbleProps {
  children: ReactNode;
}

function Avatar({ variant }: { variant: "human" | "ai" }) {
  return (
    <div
      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
        variant === "human"
          ? "bg-surface-tertiary border border-border"
          : "bg-surface-tertiary border border-border text-primary"
      }`}
    >
      {variant === "human" ? <UserIcon /> : <BotIcon />}
    </div>
  );
}

const CHAT_TURN_TEST_ID = "sdk-preview-chat-turn" as const;

export function HumanBubble({ children }: BubbleProps) {
  return (
    <div className="flex justify-end items-end gap-2" data-testid={CHAT_TURN_TEST_ID}>
      <div className="max-w-[80%] rounded-xl rounded-br-sm bg-primary-dark text-white px-4 py-3 text-sm leading-relaxed">
        {children}
      </div>
      <Avatar variant="human" />
    </div>
  );
}

export function AIBubble({ children }: BubbleProps) {
  return (
    <div className="flex justify-start items-end gap-2" data-testid={CHAT_TURN_TEST_ID}>
      <Avatar variant="ai" />
      <div className="max-w-[80%] rounded-xl rounded-bl-sm bg-surface-secondary border border-border text-text px-4 py-3 text-sm leading-relaxed">
        {children}
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  role: "human" | "ai";
  children: ReactNode;
}

export function MessageBubble({ role, children }: MessageBubbleProps) {
  const isHuman = role === "human";
  return (
    <div
      className={`flex items-end gap-2 ${isHuman ? "justify-end" : "justify-start"}`}
      data-testid={CHAT_TURN_TEST_ID}
    >
      {!isHuman && <Avatar variant="ai" />}
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
          isHuman
            ? "bg-primary-dark text-white rounded-br-sm"
            : "bg-surface-secondary border border-border text-text rounded-bl-sm"
        }`}
      >
        {children}
      </div>
      {isHuman && <Avatar variant="human" />}
    </div>
  );
}

interface ThinkingBubbleProps {
  content: string;
  isStreaming: boolean;
}

export function ThinkingBubble({ content, isStreaming }: ThinkingBubbleProps) {
  return (
    <div className="flex justify-start items-end gap-2" data-testid={CHAT_TURN_TEST_ID}>
      <Avatar variant="ai" />
      <div className="max-w-[80%] rounded-xl rounded-bl-sm bg-surface-secondary border border-border px-4 py-2.5 text-sm">
        <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-primary">
          <SparklesIcon className={`w-3.5 h-3.5 ${isStreaming ? "animate-pulse" : ""}`} />
          <span>{isStreaming ? "Thinking…" : "Thought"}</span>
          <span className="text-text-tertiary font-normal">· {content.length} chars</span>
        </div>
        <pre className="whitespace-pre-wrap text-xs font-mono text-text-secondary leading-relaxed m-0">
          {content}
        </pre>
      </div>
    </div>
  );
}
