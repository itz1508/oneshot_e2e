import React, { useState, useEffect, useRef } from "react";
import { PROVIDER_DEFINITIONS } from "../../../lib/providers";
import {
  readJsonResponse,
  resolveApiUrl,
  getOllamaInstallState,
  pullOllamaModel,
  type OllamaInstallState,
} from "../../../lib/api";

interface ModelOllamaProps {
    sessionId?: string;
    currentModel?: string;
    onModelChange?: (model: string) => void;
    onProviderSwitch?: (provider: "ollama", model: string) => void;
}

/**
 * Model/Ollama — Local Ollama card with opt-in [+] model install.
 *
 * The [+] button pulls the selected model through the backend
 * (`POST /api/ollama/pull`), which proxies the local Ollama daemon
 * (host `localhost:11434` or Docker sidecar `ollama:11434`). The browser
 * never sees the daemon URL; progress streams back as NDJSON and renders
 * as a live bar. No fake progress, no timers: every state comes from a
 * real backend payload.
 */
export const ModelOllama: React.FC<ModelOllamaProps> = ({
    sessionId,
    currentModel,
    onModelChange,
    onProviderSwitch,
}) => {
    const def = PROVIDER_DEFINITIONS.ollama;
    const [selectedModel, setSelectedModel] = useState(currentModel || def.models[0]);
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [error, setError] = useState<string | null>(null);
    const [serverInfo, setServerInfo] = useState<{ available?: boolean; latency?: number } | null>(null);
    const [install, setInstall] = useState<OllamaInstallState | null>(null);
    const [pullPct, setPullPct] = useState<number | null>(null);
    const [pullStatus, setPullStatus] = useState<string | null>(null);
    const [isPulling, setIsPulling] = useState(false);
    const pullAbort = useRef<AbortController | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const state = await getOllamaInstallState();
                if (!cancelled) setInstall(state);
            } catch {
                // Daemon state is advisory; the provider status row covers errors.
            }
        })();
        return () => {
            cancelled = true;
            pullAbort.current?.abort();
        };
    }, []);

    const refreshInstallState = async () => {
        try {
            setInstall(await getOllamaInstallState());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Ollama install state request failed");
        }
    };

    const handlePull = async () => {
        if (isPulling) return;
        setIsPulling(true);
        setError(null);
        setPullPct(null);
        setPullStatus("starting…");
        pullAbort.current?.abort();
        const ctrl = new AbortController();
        pullAbort.current = ctrl;
        try {
            for await (const evt of pullOllamaModel(selectedModel, ctrl.signal)) {
                if (evt.status) setPullStatus(evt.status);
                if (typeof evt.completed === "number" && typeof evt.total === "number" && evt.total > 0) {
                    setPullPct(Math.min(100, Math.round((evt.completed / evt.total) * 100)));
                }
            }
            setPullPct(100);
            setPullStatus("complete");
            await refreshInstallState();
        } catch (err: any) {
            if (err?.name !== "AbortError") {
                setError(err?.message || "Model pull failed");
                setPullStatus(null);
            }
        } finally {
            setIsPulling(false);
        }
    };

    const handleApply = async () => {
        setStatus("saving");
        setError(null);
        try {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (sessionId) headers["X-Session-Id"] = sessionId;

            const res = await fetch(resolveApiUrl("/api/config/provider"), {
                method: "POST",
                headers,
                body: JSON.stringify({
                    provider: "ollama",
                    model: selectedModel,
                }),
            });

            const data = await readJsonResponse<{ ok?: boolean; success?: boolean; provider?: string; model?: string }>(res, "Provider model request");
            if (data.ok !== true || data.success !== true || data.provider !== "ollama" || data.model !== selectedModel) {
                throw new Error("Provider model response did not confirm the requested model");
            }

            setStatus("saved");
            onModelChange?.(selectedModel);
            onProviderSwitch?.("ollama", selectedModel);
            setTimeout(() => setStatus("idle"), 2000);
        } catch (err: any) {
            setStatus("error");
            setError(err.message || "Network error");
        }
    };

    const handleCheckStatus = async () => {
        try {
            const res = await fetch(resolveApiUrl("/api/providers/status"));
            const data = await readJsonResponse<Record<string, { configured?: boolean; available?: boolean; latency?: number }>>(res, "Provider status request");
            const info = data.ollama;
            if (!info || typeof info.configured !== "boolean") {
                throw new Error("Ollama status response is missing configured");
            }
            setServerInfo({ available: info.available, latency: info.latency });
            await refreshInstallState();
        } catch (error) {
            setServerInfo({ available: false });
            setError(error instanceof Error ? error.message : "Ollama status request failed");
        }
    };

    const modelInstalled =
        install?.models.some((m) => m === selectedModel || m.startsWith(`${selectedModel}:`)) ?? false;
    // Installing only makes sense against a self-hosted daemon; against a
    // remote endpoint (Ollama Cloud) the model is served, not stored locally.
    const canInstall = Boolean(install?.available && install?.local);
    const installHint = !install
        ? "Checking the Ollama endpoint…"
        : modelInstalled && install.local
          ? `${selectedModel} is already on disk`
          : modelInstalled
            ? `${selectedModel} is served by the remote endpoint — nothing to install`
            : !install.available
              ? "Ollama daemon unreachable — start it to install models"
              : !install.local
                ? "Model installs need a local Ollama daemon"
                : `Pull ${selectedModel} to the local Ollama daemon`;

    return (
        <div
            className="rounded-xl border border-white/10 bg-[#181b21] p-4 space-y-3"
            role="region"
            aria-label="Ollama Model Configuration"
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <span
                        className="w-6 h-6 rounded-full shrink-0"
                        style={{ background: def.dotGradient }}
                        aria-hidden="true"
                    />
                    <div>
                        <div className="text-xs font-semibold text-[#f2f2f3]">{def.name}</div>
                        <div className="text-[10px] text-[#838d9a]">{def.sub}</div>
                    </div>
                </div>
                {modelInstalled ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#62c48d]/15 text-[#62c48d]">
                        installed
                    </span>
                ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[#838d9a]">
                        not installed
                    </span>
                )}
            </div>

            {/* Server status row */}
            {serverInfo && (
                <div className="flex items-center gap-2 text-[10px]">
                    <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            serverInfo.available ? "bg-[#62c48d]" : "bg-[#e5534b]"
                        }`}
                        aria-hidden="true"
                    />
                    <span className="text-[#838d9a]">
                        {serverInfo.available === true
                            ? `Connected · ${serverInfo.latency}ms`
                            : serverInfo.available === false
                                ? "Not reachable — start Ollama (host :11434) or enable the compose profile: docker compose --profile local-llm up"
                                : "Configured on server; availability not reported"}
                    </span>
                </div>
            )}

            {/* Model selector + [+] install */}
            <div>
                <label
                    htmlFor="ollama-model-select"
                    className="block text-[11px] font-medium text-[#838d9a] mb-1"
                >
                    Active model
                </label>
                <div className="flex items-center gap-2">
                    <select
                        id="ollama-model-select"
                        value={selectedModel}
                        onChange={(e) => {
                            setSelectedModel(e.target.value);
                            setPullPct(null);
                            setPullStatus(null);
                        }}
                        className="flex-1 h-8 px-2.5 rounded-md border border-white/15 bg-[#0d0d0e] text-white text-xs outline-none focus:border-[#79a8ea] focus-visible:ring-2 focus-visible:ring-[#79a8ea]/50"
                    >
                        {def.models.map((m: string) => (
                            <option key={m} value={m} className="bg-[#181b21]">
                                {m}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={handlePull}
                        disabled={isPulling || modelInstalled || !canInstall}
                        title={isPulling ? `Pulling ${selectedModel}…` : installHint}
                        aria-label={installHint}
                        className="w-8 h-8 shrink-0 rounded-lg border border-white/15 bg-[#262b34] hover:bg-[#2f3640] disabled:opacity-40 disabled:cursor-not-allowed text-sm text-[#c7c7cc] transition-colors"
                    >
                        {modelInstalled ? "✓" : "+"}
                    </button>
                </div>
                <p className="text-[10px] text-[#6e6e73] mt-1">{def.modelHelp}</p>
            </div>

            {/* Live pull progress — real NDJSON bytes from the daemon */}
            {(isPulling || pullStatus) && !modelInstalled && canInstall && (
                <div className="space-y-1" aria-live="polite">
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-[#79a8ea] transition-[width]"
                            style={{ width: `${pullPct ?? 0}%` }}
                        />
                    </div>
                    <div className="text-[10px] text-[#838d9a]">
                        {pullStatus ?? "pulling…"}
                        {pullPct !== null ? ` · ${pullPct}%` : ""}
                    </div>
                </div>
            )}

            {/* Install state note */}
            {install && !install.available && (
                <div className="text-[10px] text-[#e5a84b] leading-relaxed">
                    Ollama daemon unreachable. Pulls and status need a running daemon —
                    host Ollama or the compose <code className="font-mono">local-llm</code> profile.
                </div>
            )}
            {install && install.available && !install.local && (
                <div className="text-[10px] text-[#838d9a] leading-relaxed">
                    Endpoint serves remote models, so there is nothing to install here. To
                    install locally, point <code className="font-mono">OLLAMA_BASE_URL</code> at a
                    self-hosted daemon or enable the compose{" "}
                    <code className="font-mono">local-llm</code> profile.
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="p-2.5 rounded-lg border border-[#e5534b]/30 bg-[#e5534b]/10 text-[11px] text-[#e5534b]">
                    {error}
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={handleApply}
                    disabled={status === "saving"}
                    className={`flex-1 h-8 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        status === "saved"
                            ? "bg-[#62c48d]/20 border border-[#62c48d]/40 text-[#62c48d]"
                            : "bg-[#3f6ba8] hover:bg-[#4d7fc4] text-white"
                    }`}
                    aria-busy={status === "saving"}
                >
                    {status === "saving" ? "Applying..." : status === "saved" ? "✓ Applied" : "Apply to session"}
                </button>
                <button
                    type="button"
                    onClick={handleCheckStatus}
                    className="h-8 px-3 rounded-lg border border-white/15 bg-[#262b34] hover:bg-[#2f3640] text-xs text-[#c7c7cc] transition-colors"
                    aria-label="Check server connectivity"
                    title="Check server connectivity"
                >
                    ↻
                </button>
            </div>

            <p className="text-[10px] text-[#6e6e73]">{def.note}</p>
        </div>
    );
};
