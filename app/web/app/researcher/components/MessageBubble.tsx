"use client";

import { AlertTriangle, BookOpen, Check, ExternalLink, Search } from "lucide-react";
import type { ChatMessage, RunPhase } from "../types";
import { toolNamePretty } from "../lib/markdown";

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

function phaseLabel(phase: RunPhase): string {
  switch (phase) {
    case "starting": return "Starting…";
    case "searching": return "Searching the web…";
    case "reading": return "Reading sources…";
    case "writing": return "Writing answer…";
    case "done": return "Done.";
    case "error": return "Failed.";
    case "interrupted": return "Stopped.";
    default: return "Idle.";
  }
}
function CiteGuard({ message }: { message: ChatMessage }) {
  if (message.role !== "assistant" || !message.sources?.length) return null;
  const claimed = Array.from(message.content.matchAll(/\[(\d+)\]/g), (m) => Number(m[1]));
  if (claimed.length === 0) return null;
  const maxIdx = message.sources.length;
  const missing = Array.from(new Set(claimed.filter((n) => n < 1 || n > maxIdx)));
  if (missing.length === 0) {
    return (
      <div className="mt-1 flex items-center gap-1 font-mono text-[0.65rem] text-emerald" style={{ marginLeft: 16 }}>
        <Check size={11} />
        {claimed.length} citation{claimed.length > 1 ? "s" : ""} verified
      </div>
    );
  }
  return (
    <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[0.65rem] text-amber" style={{ marginLeft: 16 }}>
      <AlertTriangle size={11} />
      [{missing.join(", ")}] can&apos;t be verified
    </div>
  );
export function MessageBubble({
  message,
  streaming,
  phase,
  onOpenSource,
}: {
  message: ChatMessage;
  streaming: boolean;
  phase: RunPhase;
  onOpenSource: (n: number) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-3"
          style={{ background: "var(--accent-blue-bg)", border: "1px solid var(--accent-blue-border)" }}
        >
          <p className="text-[0.88rem] leading-relaxed whitespace-pre-wrap text-primary">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[0.62rem] font-bold text-blue"
          style={{ background: "var(--accent-blue-bg)" }}
        >OS</div>
        <div className="min-w-0 flex-1">
          {streaming && phase !== "done" && (
            <p className="mb-1.5 font-mono text-[0.68rem] text-dim">
              {phaseLabel(phase)}
            </p>
          )}

          {message.content ? (
            <div className="text-[0.87rem] leading-relaxed whitespace-pre-wrap text-primary">
              {message.content.split(/(\[\d+\])/).map((part, i) => {
                const m = part.match(/^\[(\d+)\]$/);
                if (m) {
                  const idx = Number(m[1]);
                  return (
                    <button
                      key={`${idx}-${i}`}
                      className="inline-flex items-center rounded bg-accent-blue-bg px-1 text-[0.7rem] font-medium text-blue hover:underline"
                      onClick={() => onOpenSource(idx)}
                    >[{idx}]</button>
                  );
                }
                return <span key={i}>{part}</span>;
              })}
            </div>
          ) : streaming ? (
            <span className="font-mono text-[0.82rem] text-dim animate-pulse">▊</span>
          ) : null}

          {!streaming && message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {message.toolCalls.map((t) => (
                <div key={t.id} className="rounded-lg border px-3 py-2" style={{ background:"var(--bg-input)", borderColor:"var(--line-subtle)" }}>
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded text-[0.58rem]" style={{ background:"var(--accent-blue-bg)" }}>
                      {t.name.startsWith("tavily") ? <Search size={10} /> : <BookOpen size={10} />}
                    </span>
                    <span className="font-mono text-[0.7rem] font-semibold text-muted">{toolNamePretty(t.name)}</span>
                    <span className="ml-auto font-mono text-[0.58rem] text-dim">{t.status}</span>
                  </div>
                  {t.outputSummary && (
                    <p className={`mt-1 font-mono text-[0.62rem] ${t.status==="error"?"text-rose":"text-dim"}`}>
                      {truncate(t.outputSummary, 90)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {!streaming && message.sources && message.sources.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 font-mono text-[0.68rem] font-semibold text-muted">Sources ({message.sources.length})</p>
              <ol className="space-y-1">
                {message.sources.map((s) => (
                  <li key={s.index}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[0.7rem] text-dim hover:text-blue">
                      [{s.index}] {truncate(s.title || s.url, 60)}
                      <ExternalLink size={10} />
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {message.interrupted && <p className="mt-2 font-mono text-[0.68rem] text-amber">Run was interrupted.</p>}
        </div>
      </div>
      <CiteGuard message={message} />
    </div>
  );
}
}