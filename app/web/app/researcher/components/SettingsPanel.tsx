"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { loadSettings, DEFAULT_SETTINGS } from "../lib/settings";
import { providerGateReason } from "../lib/providers";
import type { ProviderSettings } from "../types";

export function SettingsPanel({
  open,
  settings,
  onClose,
  onSave,
}: {
  open: boolean;
  settings: ProviderSettings;
  onClose: () => void;
  onSave: (next: ProviderSettings) => void;
}) {
  const [local, setLocal] = useState<ProviderSettings>(() => settings);

  if (!open) return null;

  const gate = providerGateReason(local);
  const connected = !gate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-card relative z-10 w-[420px] max-h-[85vh]">
        <div className="modal-header">
          <h3>Researcher Settings</h3>
          <button className="icon-close-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body space-y-4">
          {/* Runtime mode */}
          <div className="flex items-center gap-3">
            <span className="text-[0.75rem] font-semibold text-muted uppercase tracking-wider">Runtime</span>
            <select
              value={local.runtimeMode}
              onChange={(e) => setLocal({ ...local, runtimeMode: e.target.value as "browser" | "python" })}
              className="rounded border border-line-subtle bg-bg-input px-2 py-1 text-[0.78rem] text-primary"
            >
              <option value="browser">Browser (direct API)</option>
              <option value="python">Python backend</option>
            </select>
          </div>

          {local.runtimeMode === "python" && (
            <div>
              <label className="block mb-1 text-[0.7rem] font-semibold text-muted uppercase tracking-wider">Backend URL</label>
              <input
                type="text"
                placeholder="http://localhost:5000"
                value={local.remoteBaseUrl || ""}
                onChange={(e) => setLocal({ ...local, remoteBaseUrl: e.target.value })}
                className="w-full rounded border border-line-subtle bg-bg-input px-3 py-2 text-[0.78rem] text-primary"
              />
            </div>
          )}

          <div>
            <label className="block mb-1 text-[0.7rem] font-semibold text-muted uppercase tracking-wider">API Key</label>
            <input
              type="password"
              placeholder="sk-…"
              value={local.apiKey || ""}
              onChange={(e) => setLocal({ ...local, apiKey: e.target.value })}
              className="w-full rounded border border-line-subtle bg-bg-input px-3 py-2 text-[0.78rem] text-primary"
            />
          </div>

          <div>
            <label className="block mb-1 text-[0.7rem] font-semibold text-muted uppercase tracking-wider">Provider</label>
            <select
              value={local.provider || "openai"}
              onChange={(e) => setLocal({ ...local, provider: e.target.value })}
              className="w-full rounded border border-line-subtle bg-bg-input px-3 py-2 text-[0.78rem] text-primary"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 text-[0.7rem] font-semibold text-muted uppercase tracking-wider">Tavily API Key</label>
            <input
              type="password"
              placeholder="tvly-…"
              value={local.tavilyApiKey || ""}
              onChange={(e) => setLocal({ ...local, tavilyApiKey: e.target.value })}
              className="w-full rounded border border-line-subtle bg-bg-input px-3 py-2 text-[0.78rem] text-primary"
            />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[0.62rem] ${connected ? "connection-pill connected" : "connection-pill disconnected"}`}>
              {connected ? "Connected" : "Incomplete"}
            </span>
            {gate && <span className="text-[0.65rem] text-amber">{gate}</span>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-line-subtle">
            <button className="btn btn-secondary" onClick={() => onSave(DEFAULT_SETTINGS)}>Reset</button>
            <button className="btn btn-primary" onClick={() => onSave(local)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}