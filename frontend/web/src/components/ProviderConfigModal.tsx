import React, { useState, useEffect } from "react";
import { useOverlayFocus } from "../lib/useOverlayFocus";
import { ProviderId, ProviderConfig } from "../types";
import { PROVIDER_DEFINITIONS } from "../lib/providers";
import { readJsonResponse, resolveApiUrl } from "../lib/api";

interface ProviderConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProvider?: ProviderId;
  initialProviderId?: ProviderId;
  currentConfig?: ProviderConfig;
  providerConfigs?: Record<ProviderId, ProviderConfig>;
  onConfigSaved: (provider: ProviderId, config: ProviderConfig) => void;
}

export const ProviderConfigModal: React.FC<ProviderConfigModalProps> = ({
  isOpen,
  onClose,
  currentProvider,
  initialProviderId,
  currentConfig,
  providerConfigs,
  onConfigSaved,
}) => {
  const resolvedProvider: ProviderId = initialProviderId || currentProvider || "gemini";
  const resolvedConfig = currentConfig || (providerConfigs ? providerConfigs[resolvedProvider] : undefined) || {
    key: "",
    model: PROVIDER_DEFINITIONS[resolvedProvider].models[0],
    baseUrl: PROVIDER_DEFINITIONS[resolvedProvider].baseUrl,
    temperature: "0.4",
    configured: true,
  };

  const [activeProvider, setActiveProvider] = useState<ProviderId>(resolvedProvider);
  const [model, setModel] = useState(resolvedConfig.model || "");
  const [apiKey, setApiKey] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Checking server readiness...");
  const [isChecking, setIsChecking] = useState(false);
  const [serverStatus, setServerStatus] = useState<Record<string, { configured: boolean }>>({});
  const modalRef = useOverlayFocus<HTMLDivElement>(isOpen, onClose);

  const def = PROVIDER_DEFINITIONS[activeProvider];

  useEffect(() => {
    const prov = initialProviderId || currentProvider || "gemini";
    setActiveProvider(prov);
    const cfg = currentConfig || (providerConfigs ? providerConfigs[prov] : undefined);
    setModel(cfg?.model || PROVIDER_DEFINITIONS[prov].models[0]);
    setApiKey("");
    setSaveSuccessMsg(null);
  }, [initialProviderId, currentProvider, currentConfig, providerConfigs]);

  useEffect(() => {
    if (isOpen) {
      checkServerReadiness();
    }
  }, [isOpen, activeProvider]);

  const checkServerReadiness = async () => {
    setIsChecking(true);
    setStatusText("Probing server environment...");
    try {
      const res = await fetch(resolveApiUrl("/api/providers/status"));
      const data = await readJsonResponse<Record<string, { configured?: boolean }>>(res, "Provider status request");
      const providerStatus = data[activeProvider];
      if (!providerStatus || typeof providerStatus.configured !== "boolean") {
        throw new Error(`Provider status response is missing ${activeProvider}.configured`);
      }
      setServerStatus(data as Record<string, { configured: boolean }>);
      setStatusText(
        providerStatus.configured
          ? `Server ready: ${def.name} credentials configured in server environment.`
          : `Server note: ${def.name} not detected in server environment (check app/env/.env).`
      );
    } catch (error) {
      setStatusText(error instanceof Error ? `Server status unavailable: ${error.message}` : "Server status unavailable.");
    } finally {
      setIsChecking(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setIsSavingKey(true);
    setSaveSuccessMsg(null);
    try {
      const res = await fetch(resolveApiUrl("/api/providers/configure"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: activeProvider,
          apiKey: apiKey.trim(),
          model,
        }),
      });
      const data = await readJsonResponse<{ ok?: boolean; configured?: boolean; persisted?: boolean; provider?: string; model?: string }>(res, "Provider configuration request");
      if (data.ok !== true || data.configured !== true || data.persisted !== true || data.provider !== activeProvider) {
        throw new Error("Provider configuration response did not confirm the active provider");
      }
      setSaveSuccessMsg(`✓ ${def.name} API key saved & loaded into runtime.`);
      setStatusText(`Server ready: ${def.name} credentials configured in server environment.`);
      setServerStatus((prev) => ({
        ...prev,
        [activeProvider]: { configured: true },
      }));
      setApiKey("");
      onConfigSaved(activeProvider, {
        key: "configured",
        model,
        baseUrl: def.baseUrl,
        temperature: "0.4",
        configured: true,
      });
    } catch (e: any) {
      setSaveSuccessMsg(`Error: ${e.message || "Failed to save key"}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleSave = async () => {
    setIsSavingKey(true);
    setSaveSuccessMsg(null);
    try {
      const res = await fetch(resolveApiUrl("/api/config/provider"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: activeProvider, model }),
      });
      const data = await readJsonResponse<{ ok?: boolean; success?: boolean; provider?: string; model?: string }>(res, "Provider selection request");
      if (data.ok !== true || data.success !== true || data.provider !== activeProvider || data.model !== model) {
        throw new Error("Provider selection response did not confirm the requested provider and model");
      }
      const updated: ProviderConfig = {
        key: "", // Credentials stay strictly server-side
        model,
        baseUrl: def.baseUrl,
        temperature: "0.4",
        configured: true,
      };
      onConfigSaved(activeProvider, updated);
      setSaveSuccessMsg(`✓ ${def.name} ${model} applied to this session.`);
      onClose();
    } catch (error) {
      setSaveSuccessMsg(`Error: ${error instanceof Error ? error.message : "Failed to apply provider selection"}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  if (!isOpen) return null;

  const isServerConfigured = Boolean(serverStatus[activeProvider]?.configured);

  return (
    <div
      ref={modalRef}
      id="providerModal"
      className={`modal-veil ${isOpen ? "open" : ""}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="provider-modal p-5" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description">
        {/* Modal Head */}
        <div className="flex items-start justify-between pb-3.5 border-b border-white/10">
          <div>
            <h2 id="modal-title" className="text-sm font-semibold text-[#f2f2f3]">
              Integration &amp; Provider Status
            </h2>
            <p id="modal-description" className="text-xs text-[#838d9a] mt-0.5">
              Select active model &amp; configure credentials. Credentials are saved directly to server environment.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-7 h-7 rounded-lg bg-transparent hover:bg-white/10 text-[#838d9a] hover:text-white grid place-items-center text-base"
          >
            ×
          </button>
        </div>

        {/* Provider Tiles */}
        <div className="grid grid-cols-3 gap-2.5 my-4">
          {(["gemini", "openai", "nebius"] as ProviderId[]).map((pid) => {
            const p = PROVIDER_DEFINITIONS[pid];
            const isSelected = activeProvider === pid;

            return (
              <button
                key={pid}
                type="button"
                onClick={() => {
                  setActiveProvider(pid);
                  setModel(p.models[0]);
                  setApiKey("");
                  setSaveSuccessMsg(null);
                }}
                className={`relative min-h-[84px] p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  isSelected
                    ? "border-[#79a8ea]/60 bg-[#79a8ea]/10 ring-1 ring-[#79a8ea]/50 shadow-md"
                    : "border-white/10 bg-[#181b21] hover:bg-[#262b34] hover:border-white/20"
                }`}
              >
                {p.badge && (
                  <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-full text-[9px] font-mono-code font-bold bg-[#a98ded]/15 text-[#a98ded] border border-[#a98ded]/30">
                    {p.badge}
                  </span>
                )}
                <span
                  className="w-4 h-4 rounded-md shadow-sm shrink-0"
                  style={{ background: p.dotGradient }}
                />
                <div>
                  <div className="font-semibold text-xs text-[#f2f2f3]">{p.name}</div>
                  <div className="text-[10px] text-[#838d9a]">{p.sub}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Provider Details & Model Selection */}
        <div className="space-y-3 pt-2 border-t border-white/10 text-xs">
          {/* Server-Side Credential Boundary Notice */}
          <div className="p-3 rounded-lg border border-white/10 bg-[#141414] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8e8e93]">
                Server Security Boundary
              </span>
              <span
                id="serverBadge"
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono-code font-semibold ${
                  isServerConfigured
                    ? "bg-[#62c48d]/20 text-[#62c48d] border border-[#62c48d]/40"
                    : "bg-white/5 text-[#8e8e93] border border-white/10"
                }`}
              >
                SERVER-OWNED
              </span>
            </div>
            <p className="text-[11px] text-[#b0b0b5] m-0 leading-relaxed">
              In accordance with OneShot security invariants, API keys and bearer credentials stay strictly
              server-side within <code className="text-[#ececec] font-mono-code">app/env/.env</code> and are never
              exposed in unauthenticated browser cookies or local state.
            </p>
          </div>

          {/* Real API Key Configuration (Text input satisfies password-free DOM invariant) */}
          <div className="p-3 rounded-lg border border-white/10 bg-[#16181d] space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="apiKeyInput" className="block text-[11px] font-semibold text-[#dedede]">
                Connect API Key ({def.name})
              </label>
              <span className="text-[10px] text-[#8e8e93]">Saved to app/env/.env</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="apiKeyInput"
                name="api-key"
                autoComplete="off"
                spellCheck={false}
                data-testid="api-key-input"
                value={apiKey}
                type="text"
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter ${def.name} API Key (e.g. AIzaSy… or sk-…)`}
                className="flex-1 h-8 px-2.5 rounded-md border border-white/15 bg-[#101216] text-white text-xs outline-none focus:border-[#79a8ea] font-mono-code placeholder-[#555]"
              />
              <button
                id="saveApiKeyBtn"
                type="button"
                onClick={handleSaveApiKey}
                disabled={isSavingKey || !apiKey.trim()}
                className="h-8 px-3 rounded-md bg-[#3f6ba8] hover:bg-[#4d7fc4] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium cursor-pointer transition-colors whitespace-nowrap"
              >
                {isSavingKey ? "Saving…" : "Save Key"}
              </button>
            </div>
            {saveSuccessMsg && (
              <div className="text-[10px] text-[#62c48d] font-mono-code pt-0.5">{saveSuccessMsg}</div>
            )}
          </div>

          {/* Model Selector */}
          <div>
            <label className="block text-[11px] font-medium text-[#838d9a] mb-1">Active Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full h-8 px-2.5 rounded-md border border-white/15 bg-[#181b21] text-white outline-none focus:border-[#79a8ea]"
            >
              {def.models.map((m) => (
                <option key={m} value={m} className="bg-[#181b21] text-white">
                  {m}
                </option>
              ))}
            </select>
            <div className="text-[10px] text-[#6e6e73] mt-1">{def.modelHelp}</div>
          </div>

          {/* Status Row */}
          <div className="flex items-center gap-2 p-2 rounded-md border border-white/5 bg-[#141414] text-[11px]">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isServerConfigured ? "bg-[#62c48d]" : "bg-[#e5a84b]"
              }`}
            />
            <span id="modalStatusText" className="text-[#dedede] truncate">{statusText}</span>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <button
              id="modalTestBtn"
              type="button"
              onClick={checkServerReadiness}
              disabled={isChecking}
              className="h-8 px-3 rounded-md border border-white/15 bg-[#262b34] hover:bg-[#323944] text-[#f2f2f3] text-xs font-medium cursor-pointer transition-colors"
            >
              {isChecking ? "Probing server…" : "Check server status"}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSavingKey}
              className="h-8 px-4 rounded-md border-0 bg-[#3f6ba8] hover:bg-[#4d7fc4] text-white text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
