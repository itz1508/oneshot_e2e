"use client";

import { Send, Square } from "lucide-react";
import { type FormEvent, useState } from "react";

export function ChatInput({
  onSend,
  onStop,
  busy,
  disabled,
  hint,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const [value, setValue] = useState("");

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = value.trim();
    if (!text || busy || disabled) return;
    onSend(text);
    setValue("");
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-2">
      {hint && <p className="mb-2 text-center font-mono text-[0.7rem] text-warning">{hint}</p>}
      <form onSubmit={submit} className="relative flex items-end gap-2 rounded-2xl border border-line-strong bg-bg-raised p-2 shadow-composer">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={busy ? "Assistant is working…" : "Ask anything…"}
          disabled={busy || disabled}
          rows={1}
          className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[0.9rem] leading-relaxed placeholder:text-text-dim focus:outline-none disabled:opacity-50"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/20 text-destructive hover:bg-destructive/30"
            aria-label="Stop"
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim() || disabled}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-blue text-white hover:bg-accent-blue-strong disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        )}
      </form>
      <p className="mt-2 text-center font-mono text-[0.65rem] text-text-dim">
        OneShot may make mistakes. Verify facts against the Sources panel.
      </p>
    </div>
  );
}
