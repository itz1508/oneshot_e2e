import React, { useState } from "react";
import { useOverlayFocus } from "../lib/useOverlayFocus";

<<<<<<< HEAD
import { readJsonResponse } from "../lib/api";
=======
import { readJsonResponse, resolveApiUrl } from "../lib/api";
>>>>>>> rebuild-researcher-only

interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface ResearcherDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertCitation?: (text: string) => void;
}

export const ResearcherDrawer: React.FC<ResearcherDrawerProps> = ({
  isOpen,
  onClose,
  onInsertCitation,
}) => {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const drawerRef = useOverlayFocus<HTMLDivElement>(isOpen, onClose);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);

    try {
      const res = await fetch(resolveApiUrl("/api/research/query"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await readJsonResponse<{ query: string; results: SearchResult[] }>(res, "Research search request");
      if (data.query !== query.trim() || !Array.isArray(data.results) || data.results.some((result) => !result.title || !result.url || !result.content)) {
        throw new Error("Research search response failed its result contract");
      }
      setResults(data.results);
    } catch (error) {
      setResults([]);
      setError(error instanceof Error ? error.message : "Research search is currently unavailable. Check the server connection and try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div
      ref={drawerRef}
      id="researcherDrawer"
      className={`context-review-drawer ${isOpen ? "open" : ""}`}
      aria-hidden={!isOpen}
      aria-label="Standalone researcher drawer"
      role="dialog"
      aria-modal="true"
      inert={!isOpen}
    >
      {/* Header */}
      <div className="min-h-[52px] px-4 flex items-center justify-between border-b border-white/[0.075] bg-[#141416]">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#62c48d]">🔍</span>
          <span className="font-semibold text-xs text-[#ececec]">Standalone Tavily Researcher</span>
        </div>
        <button
          id="closeResearcherDrawerBtn"
          type="button"
          onClick={onClose}
          aria-label="Close researcher drawer"
          className="w-7 h-7 rounded-lg bg-transparent hover:bg-white/10 text-[#8e8e93] hover:text-white grid place-items-center text-sm transition-colors cursor-pointer"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Search Input Box */}
        <div className="space-y-2">
          <label htmlFor="tavilySearchInput" className="block text-[11px] font-semibold text-[#dedede]">
            Web &amp; Knowledge Search
          </label>
          <div className="flex items-center gap-2">
            <input
              id="tavilySearchInput"
              type="text"
              name="research-query"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search Tavily or OneShot codebase..."
              className="min-w-0 flex-1 h-8 px-2.5 rounded-md border border-white/15 bg-[#181b21] text-white text-xs outline-none focus:border-[#79a8ea] focus-visible:ring-2 focus-visible:ring-[#79a8ea]/50 font-mono-code"
            />
            <button
              id="tavilySearchBtn"
              type="button"
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
              className="h-8 px-3 rounded-md bg-[#3f6ba8] hover:bg-[#4d7fc4] disabled:opacity-40 text-white text-xs font-medium cursor-pointer transition-colors"
            >
              {isSearching ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="space-y-3 pt-2 border-t border-white/10" aria-live="polite">
          {error && (
            <div className="rounded-lg border border-[#e5a84b]/30 bg-[#e5a84b]/10 p-3 text-[11px] text-[#e5a84b]" role="alert">
              {error}
              <button type="button" onClick={handleSearch} className="mt-2 block underline hover:text-white">
                Retry search
              </button>
            </div>
          )}
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6e6e73]">
            Research Sources ({results.length})
          </div>

          {results.length === 0 && !isSearching && (
            <div className="text-[11px] text-[#6e6e73] italic py-2">
              Enter a research query above to perform live web sources and inspect the returned citations.
            </div>
          )}

          {results.map((r, i) => (
            <div
              key={i}
              className="p-3 rounded-lg border border-white/10 bg-[#16181d] space-y-2 hover:border-white/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-xs text-[#79a8ea] hover:underline"
                  >
                    {r.title}
                  </a>
                  <div className="text-[9px] text-[#6e6e73] font-mono-code truncate mt-0.5">
                    {r.url}
                  </div>
                </div>
                {r.score && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-code bg-[#62c48d]/10 text-[#62c48d] border border-[#62c48d]/20 shrink-0">
                    {Math.round(r.score * 100)}%
                  </span>
                )}
              </div>

              <p className="text-[11px] text-[#b0b0b5] leading-relaxed m-0">
                {r.content}
              </p>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => onInsertCitation?.(`[Citation: ${r.title}](${r.url})`)}
                  className="insert-cite-btn px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] font-medium text-[#dedede] hover:text-white border border-white/10 transition-colors cursor-pointer"
                >
                  Insert Citation
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
