import React, { useState } from "react";
import { EarlierContextItem } from "../types";

interface EarlierConversationProps {
  items: EarlierContextItem[];
  onSelectContext: (item: EarlierContextItem) => void;
  selectedContextId?: string | null;
}

export const EarlierConversation: React.FC<EarlierConversationProps> = ({
  items,
  onSelectContext,
  selectedContextId,
}) => {
  const [isSummaryMode, setIsSummaryMode] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, item: EarlierContextItem) => {
    e.preventDefault();
    e.stopPropagation();
    const refText = `[${item.title}](oneshot://context/${item.id})`;
    navigator.clipboard.writeText(refText).catch(() => {});
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1000);
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="relative w-full max-w-[780px] mx-auto my-3 select-none">
      <details id="earlierCard" className="w-full border-y border-white/[0.075] py-1 bg-transparent group" open>
        <summary className="flex items-center justify-between min-h-[38px] px-1 cursor-pointer text-xs font-semibold text-[#b7b7bc] hover:text-[#f2f2f3] list-none">
          <span className="font-mono-code font-semibold tracking-tight text-[#d0d0d4]">
            Earlier Conversation
          </span>

          <div
            className="flex items-center gap-2 pl-4"
            onClick={(e) => e.stopPropagation()}
          >
            <label className="earlier-switch" title="Toggle between Detail and Summary mode">
              <input
                id="earlierToggleSwitch"
                type="checkbox"
                checked={isSummaryMode}
                onChange={(e) => setIsSummaryMode(e.target.checked)}
                aria-label="Toggle fixed summary"
              />
              <span className="earlier-switch-track" />
            </label>
          </div>
        </summary>

        {/* Content body */}
        <div className="pt-2 pb-3 px-2">
          {!isSummaryMode ? (
            /* Detail View */
            <div id="earlierDetailView" className="space-y-1">
              {items.map((item) => {
                const isSelected = item.id === selectedContextId;
                return (
                  <div
                    key={item.id}
                    className={`grid grid-cols-[1fr_24px] items-center gap-2 px-2 py-1 rounded-md transition-colors ${
                      isSelected ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectContext(item)}
                      className="text-left font-mono-code text-[11px] text-[#c4c4c9] hover:text-white truncate"
                    >
                      {item.title}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleCopy(e, item)}
                      title="Copy context reference"
                      aria-label={`Copy reference for ${item.title}`}
                      className="w-5 h-5 grid place-items-center rounded bg-transparent border border-white/10 text-[10px] text-[#77777d] hover:text-white hover:bg-white/10 transition-colors"
                    >
                      {copiedId === item.id ? "✓" : "□"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Fixed Summary View */
            <div id="earlierSummaryView" className="px-2 py-2">
              <button
                type="button"
                onClick={() =>
                  onSelectContext({
                    id: "fixed-intent-ui-01",
                    title: "Conversational UI with preserved context and validated results",
                    source: "Resolved from the preserved Earlier Conversation context.",
                    category: "Fixed Intent",
                    date: "2026-09-11",
                    time: "10:42",
                    agent: "Summary-Agent",
                    restoreId: "restore-summary-ui-01",
                  })
                }
                className="text-left font-mono-code text-[11px] text-[#dedede] hover:text-white hover:underline transition-colors block"
              >
                Conversational UI with preserved context and validated results
              </button>
              <div className="mt-1 text-[9px] text-[#65656a]">
                Context: {items.length} parts · References: {items.length} · Ref: #UI-01
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
};
