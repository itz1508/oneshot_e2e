import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

// Extract magic numbers to constants
const MIN_TEXTAREA_HEIGHT = 44;
const MAX_TEXTAREA_HEIGHT = 160;
const COMPOSER_GRADIENT_STOP = "rgba(13,13,14,0) 100%";
const QUICK_TOOLS_SCROLL_PADDING = 1;

interface ComposerProps {
  onSend: (text: string) => void;
  onAbort?: () => void;
  isRunning?: boolean;
  disabled?: boolean;
  isSidebarCollapsed?: boolean;
  externalText?: string;
}

export const Composer: React.FC<ComposerProps> = ({
  onSend,
  onAbort,
  isRunning = false,
  disabled = false,
  isSidebarCollapsed = false,
  externalText,
}) => {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Memoize quick tools to prevent unnecessary re-renders
  const QUICK_TOOLS = useMemo(
    () => [
      {
        label: "🔍 Tavily Research",
        prompt: "Research OneShot architecture and human gates",
      },
      { label: "🎨 Generate UI Mockup", prompt: "Generate UI mockup for modern dashboard" },
      {
        label: "📸 Capture Screenshot",
        prompt: "Capture screenshot of active application viewport",
      },
      { label: "📋 Human Gate Status", prompt: "Inspect workflow human gates status" },
      { label: "🚀 Stage Transition", prompt: "Transition workflow stage to planning" },
      { label: "💾 Git Snapshot", prompt: "Create git storage snapshot of workspace" },
    ],
    []
  );

  useEffect(() => {
    if (externalText !== undefined) {
      setText(externalText);
    }
  }, [externalText]);

  // Memoized keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    []
  );

  // Memoized submit handler
  const handleSubmit = useCallback(() => {
    if (!text.trim() || isRunning || disabled) return;
    onSend(text.trim());
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
    }
  }, [text, isRunning, disabled, onSend]);

  // Auto-resize textarea with memoized callback
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        MAX_TEXTAREA_HEIGHT
      )}px`;
    }
  }, []);

  // Memoized quick tool handler
  const handleSelectQuickTool = useCallback((prompt: string) => {
    setText(prompt);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const gradientStyle = useMemo(() => ({
    background: `linear-gradient(to top, rgba(13,13,14,1) 0%, rgba(13,13,14,0.96) 65%, ${COMPOSER_GRADIENT_STOP})`,
  }), []);

  const isTextEmpty = !text.trim();
  const canSend = !isTextEmpty && !isRunning && !disabled;

  return (
    <div
      className={`fixed bottom-0 right-0 z-10 px-6 py-5 pointer-events-none transition-[left] duration-200 ${
        isSidebarCollapsed ? "left-0" : "left-[248px]"
      }`}
      style={gradientStyle}
    >
      <div className="w-full max-w-[732px] mx-auto flex flex-col gap-2 pointer-events-auto">
        {/* Quick Tools Bar */}
        <section
          className="flex items-center gap-1.5 overflow-x-auto py-1 px-1 select-none"
          aria-label="Quick tools"
        >
          {QUICK_TOOLS.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => handleSelectQuickTool(t.prompt)}
              className="px-2.5 py-1 rounded-full border border-white/10 bg-[#16181d] hover:bg-white/10 text-xs text-[#c7c7cc] hover:text-white transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              aria-label={t.label}
            >
              {t.label}
            </button>
          ))}
        </section>

        {/* Input box */}
        <form
          className="w-full min-h-[52px] border border-white/[0.1] rounded-[18px] bg-[#18181a] shadow-2xl p-2 px-3.5 flex flex-col justify-between focus-within:border-white/20 transition-colors"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <textarea
            id="composerInput"
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isRunning ? "OneShot is responding..." : "Message OneShot..."
            }
            rows={1}
            disabled={disabled || isRunning}
            className="w-full min-h-[38px] max-h-[160px] bg-transparent border-0 outline-none resize-none text-sm text-white placeholder-[#77777d] leading-relaxed py-1 focus-visible:outline-none"
            aria-label="Message input"
            aria-describedby={isRunning ? "running-status" : undefined}
          />

          {isRunning && (
            <div
              id="running-status"
              className="sr-only"
              role="status"
              aria-live="polite"
            >
              OneShot is responding. Press the abort button to stop.
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
            <button
              type="button"
              title="Attach context or file"
              disabled={isRunning}
              className="w-7 h-7 rounded-full bg-transparent hover:bg-white/10 text-white grid place-items-center text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              aria-label="Attach context or file"
            >
              ＋
            </button>

            {isRunning ? (
              <button
                type="button"
                onClick={onAbort}
                title="Stop response"
                className="w-7 h-7 rounded-full bg-[#e5534b] text-white grid place-items-center text-xs font-bold hover:scale-105 transition-all shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff453a]"
                aria-label="Stop response"
              >
                ■
              </button>
            ) : (
              <button
                id="composerSendBtn"
                type="submit"
                disabled={isTextEmpty || disabled}
                title={canSend ? "Send message" : "Enter a message to send"}
                className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                  canSend
                    ? "bg-white text-black hover:scale-105"
                    : "bg-white/20 text-[#777] cursor-not-allowed"
                }`}
                aria-label="Send message"
              >
                ↑
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
