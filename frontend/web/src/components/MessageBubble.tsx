import React, { useMemo, useCallback, useState, FC } from "react";
import { Message } from "../types";
import {
  extractStructuredOutput,
  validateFields,
  getStructuredFallbackText,
} from "../lib/structured-output";
import { ToolCallList } from "./ToolCallList";

interface MessageBubbleProps {
  message: Message;
  isLatest?: boolean;
  onSelectCitation?: (num: number) => void;
}

// Memoized inline markdown renderer to prevent unnecessary rerenders
const renderInlineMarkdown = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-[#ececec]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      })}
    </>
  );
};

// Memoized structured data renderer
const StructuredDataRenderer: FC<{ data: Record<string, any> }> = ({
  data,
}) => {
  const statusVal = data.status || data.stage || data.state;
  const bodyVal = data.summary || data.description || data.text || data.content;
  const arrayVal = data.items || data.steps || data.results || data.list;

  return (
    <article className="my-2.5 p-3 rounded-xl border border-white/10 bg-[#16171a] space-y-2.5">
      {statusVal && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-mono-code font-bold px-2 py-0.5 rounded-md bg-[#62c48d]/15 text-[#62c48d] border border-[#62c48d]/30">
            {String(statusVal)}
          </span>
          {data.title && (
            <span className="text-xs font-semibold text-[#f0f0f3]">
              {data.title}
            </span>
          )}
        </div>
      )}

      {bodyVal && (
        <p className="text-xs text-[#c0c0c5] leading-relaxed m-0">
          {String(bodyVal)}
        </p>
      )}

      {Array.isArray(arrayVal) && (
        <ul className="space-y-1 pt-1 border-t border-white/5 m-0 pl-0">
          {(arrayVal as any[]).map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 text-xs text-[#d0d0d5] py-0.5"
            >
              <span className="text-[#6e6e73] font-mono-code text-[11px] shrink-0">
                {idx + 1}.
              </span>
              <span className="leading-relaxed">
                {typeof item === "object" ? JSON.stringify(item) : String(item)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
};

// Memoized formatted content renderer
const FormattedContentRenderer: FC<{ raw: string }> = ({ raw }) => {
  const trimmed = raw.trim();
  const isJsonLike =
    trimmed.startsWith("{") ||
    trimmed.startsWith("```json") ||
    (trimmed.startsWith("```") && trimmed.includes("{"));

  if (isJsonLike) {
    const extracted = extractStructuredOutput(trimmed);
    if (extracted && Object.keys(extracted).length > 0) {
      return <StructuredDataRenderer data={extracted} />;
    }
    if (extracted) {
      return (
        <p className="my-1.5 text-sm text-[#d0d0d5] leading-relaxed">
          {getStructuredFallbackText(extracted)}
        </p>
      );
    }
  }

  const lines = raw.split("\n");
  return (
    <>
      {lines.map((line, idx) => {
        if (line.startsWith("### "))
          return (
            <h3
              key={idx}
              className="text-base font-semibold text-[#f2f2f3] mt-3 mb-2"
            >
              {line.replace("### ", "")}
            </h3>
          );
        if (line.startsWith("## "))
          return (
            <h2
              key={idx}
              className="text-lg font-semibold text-[#f2f2f3] mt-4 mb-2"
            >
              {line.replace("## ", "")}
            </h2>
          );
        if (line.startsWith("# "))
          return (
            <h1
              key={idx}
              className="text-xl font-bold text-[#f2f2f3] mt-5 mb-3"
            >
              {line.replace("# ", "")}
            </h1>
          );
        if (line.startsWith("* ") || line.startsWith("- "))
          return (
            <ul key={idx} className="list-disc ml-4 my-1">
              <li className="text-sm text-[#d0d0d5] leading-relaxed">
                {renderInlineMarkdown(line.slice(2))}
              </li>
            </ul>
          );
        if (line.trim() === "")
          return (
            <div key={idx} className="h-2" aria-hidden="true" />
          );
        return (
          <p
            key={idx}
            className="my-1.5 text-sm text-[#d0d0d5] leading-relaxed"
          >
            {renderInlineMarkdown(line)}
          </p>
        );
      })}
    </>
  );
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isLatest = true,
  onSelectCitation,
}) => {
  const isUser = message.role === "user";
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "unavailable">("idle");
  const [forkStatus, setForkStatus] = useState<"idle" | "branched" | "unavailable">("idle");

  // Memoized copy handler
  const handleCopy = useCallback(async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API is unavailable");
      await Promise.race([
        navigator.clipboard.writeText(message.content),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Clipboard permission timed out")), 750)),
      ]);
      setCopyStatus("copied");
    } catch (err) {
      console.error("Failed to copy:", err);
      setCopyStatus("unavailable");
    }
    window.setTimeout(() => setCopyStatus("idle"), 1500);
  }, [message.content]);

  // Memoized fork handler
  const handleFork = useCallback(async () => {
    try {
      const response = await fetch("/api/session/fork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id }),
      });
      if (!response.ok) throw new Error(`Fork request failed: ${response.status}`);
      setForkStatus("branched");
    } catch (err) {
      console.error("Failed to fork:", err);
      setForkStatus("unavailable");
    }
    window.setTimeout(() => setForkStatus("idle"), 1500);
  }, [message.id]);

  // Memoized citation handler
  const handleCitationClick = useCallback(
    (num: number) => {
      onSelectCitation?.(num);
    },
    [onSelectCitation]
  );

  // Memoized formatted content
  const formattedContent = useMemo(
    () => <FormattedContentRenderer raw={message.content} />,
    [message.content]
  );

  if (isUser) {
    return (
      <article
        className="flex justify-end my-4"
        role="article"
        aria-label="User message"
      >
        <div className="max-w-[82%] min-w-0 break-words overflow-wrap-anywhere px-3.5 py-2.5 rounded-2xl rounded-br-sm border border-white/10 bg-[#171719] text-[#f2f2f3] text-sm leading-relaxed shadow-sm">
          {message.content}
        </div>
      </article>
    );
  }

  return (
    <article
      className="my-4 space-y-2"
      role="article"
      aria-label="Assistant message"
    >
      <header className="text-[11px] font-semibold text-[#8e8e93] tracking-wide">
        OneShot Assistant
      </header>
      <div
        id={isLatest ? "asstContent" : undefined}
        className="min-w-0 max-w-full break-words overflow-wrap-anywhere text-sm leading-relaxed text-[#d0d0d5]"
        role="region"
        aria-live={isLatest ? "polite" : "off"}
        aria-atomic="false"
      >
        {formattedContent}
        {message.isStreaming && (
          <span
            className="inline-block w-1.5 h-4 ml-1 bg-[#79a8ea] animate-pulse align-middle"
            role="status"
            aria-label="Streaming"
          />
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallList toolCalls={message.toolCalls} />
        )}
      </div>

      <div
        className="flex items-center gap-2 pt-1 text-xs text-[#8e8e93]"
        role="toolbar"
        aria-label="Message actions"
      >
        <button
          data-action="copy"
          type="button"
          onClick={handleCopy}
          className="px-2 py-1 rounded hover:bg-white/5 transition-colors cursor-pointer text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-md"
          aria-label="Copy message to clipboard"
          aria-live="polite"
        >
          {copyStatus === "copied" ? "✓ Copied" : copyStatus === "unavailable" ? "Clipboard unavailable" : "□ Copy"}
        </button>
        <button
          data-action="fork"
          type="button"
          onClick={handleFork}
          className="px-2 py-1 rounded hover:bg-white/5 transition-colors cursor-pointer text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-md"
          aria-label="Fork conversation from this message"
          aria-live="polite"
        >
          {forkStatus === "branched" ? "⑂ Branch" : forkStatus === "unavailable" ? "Fork unavailable" : "⑂ Fork"}
        </button>
      </div>

      {message.citations && message.citations.length > 0 && (
        <section className="mt-4 pt-3 border-t border-white/10">
          <h2 className="text-[11px] font-semibold text-[#8e8e93] mb-2">
            Sources
          </h2>
          <ul className="flex flex-wrap gap-2" role="list">
            {message.citations.map((c) => (
              <li key={c.id} role="listitem">
                <button
                  type="button"
                  onClick={() => handleCitationClick(c.num)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-[#18181a] hover:bg-white/10 text-[11px] text-[#c7c7cc] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                  aria-label={`Citation ${c.num}: ${c.title}`}
                >
                  <span className="font-semibold">{c.num} ·</span>
                  <span>{c.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
};
