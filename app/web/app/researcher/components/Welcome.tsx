"use client";

import { ArrowRight, Globe, Search } from "lucide-react";
import type { ProviderSettings } from "../types";

const SAMPLE_PROMPTS = [
  { icon: Search, text: "What are the latest advances in AI agents?" },
  { icon: Globe, text: "Summarize the current state of web development frameworks." },
  { icon: ArrowRight, text: "Compare Next.js, Remix, and Astro for a production app." },
];

export function Welcome({
  settings,
  onOpenSettings,
  onSendSample,
}: {
  settings: ProviderSettings;
  onOpenSettings: () => void;
  onSendSample: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 pt-20 pb-10">
      <div className="brand mb-6">
        <span className="brand-mark" style={{ width: 32, height: 32, fontSize: 13 }}>
          OS
        </span>
        <span className="brand-title" style={{ fontSize: 18 }}>
          OneShot Researcher
        </span>
      </div>
      <p className="mb-10 max-w-lg text-center text-[0.85rem] leading-relaxed text-muted">
        Ask a research question. The agent searches the web, reads pages, and writes a cited answer.
      </p>

      <div className="flex flex-wrap justify-center gap-3 max-w-xl">
        {SAMPLE_PROMPTS.map((p) => (
          <button
            key={p.text}
            className="card cursor-pointer px-4 py-3 text-left hover:border-accent-blue-border transition-colors"
            onClick={() => onSendSample(p.text)}
            style={{ margin: 0 }}
          >
            <div className="flex items-center gap-2.5">
              <p.icon size={15} className="text-dim" />
              <span className="text-[0.82rem] font-medium text-secondary">{p.text}</span>
            </div>
          </button>
        ))}
      </div>

      <p className="mt-8 font-mono text-[0.68rem] text-dim">
        Not configured?{" "}
        <button
          className="font-medium text-blue underline decoration-dotted underline-offset-4 hover:text-blue-strong"
          onClick={onOpenSettings}
        >
          Open Settings
        </button>
      </p>
    </div>
  );
}