import React, { useState } from "react";
import { PROVIDER_DEFINITIONS } from "../../../lib/providers";
import { readJsonResponse, resolveApiUrl } from "../../../lib/api";

interface ModelOpenAIProps {
    sessionId?: string;
    currentModel?: string;
    onModelChange?: (model: string) => void;
    onProviderSwitch?: (provider: "openai", model: string) => void;
}

/**
 * Model/OpenAI — Independent OpenAI model configuration card.
 * Connects to /api/config/provider to switch active backend model.
 * API key stays server-side per OneShot security invariants.
 */
export const ModelOpenAI: React.FC<ModelOpenAIProps> = ({
    sessionId,
    currentModel,
    onModelChange,
    onProviderSwitch,
}) => {
    const def = PROVIDER_DEFINITIONS.openai;
    const [selectedModel, setSelectedModel] = useState(currentModel || def.models[0]);
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [error, setError] = useState<string | null>(null);
    const [serverInfo, setServerInfo] = useState<{ available?: boolean; latency?: number } | null>(null);

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
                    provider: "openai",
                    model: selectedModel,
                }),
            });

            const data = await readJsonResponse<{ ok?: boolean; success?: boolean; provider?: string; model?: string }>(res, "Provider model request");
            if (data.ok !== true || data.success !== true || data.provider !== "openai" || data.model !== selectedModel) {
                throw new Error("Provider model response did not confirm the requested model");
            }

            setStatus("saved");
            onModelChange?.(selectedModel);
            onProviderSwitch?.("openai", selectedModel);
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
            const info = data.openai;
            if (!info || typeof info.configured !== "boolean") {
                throw new Error("OpenAI status response is missing configured");
            }
            setServerInfo({ available: info.available, latency: info.latency });
        } catch (error) {
            setServerInfo({ available: false });
            setError(error instanceof Error ? error.message : "OpenAI status request failed");
        }
    };

    return (
        <div
            className="rounded-xl border border-white/10 bg-[#181b21] p-4 space-y-3"
            role="region"
            aria-label="OpenAI Model Configuration"
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <span
                        className="w-7 h-7 rounded-lg shrink-0 grid place-items-center text-[10px] font-bold text-white"
                        style={{ background: def.dotGradient }}
                        aria-hidden="true"
                    />
                    <div>
                        <div className="text-xs font-semibold text-[#f2f2f3]">{def.name}</div>
                        <div className="text-[10px] text-[#838d9a]">{def.sub}</div>
                    </div>
                </div>
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
                                ? "Not reachable — check OPENAI_API_KEY in app/env/.env"
                                : "Configured on server; availability not reported"}
                    </span>
                </div>
            )}

            {/* Model selector */}
            <div>
                <label
                    htmlFor="openai-model-select"
                    className="block text-[11px] font-medium text-[#838d9a] mb-1"
                >
                    Active model
                </label>
                <select
                    id="openai-model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-md border border-white/15 bg-[#0d0d0e] text-white text-xs outline-none focus:border-[#79a8ea] focus-visible:ring-2 focus-visible:ring-[#79a8ea]/50"
                >
                    {def.models.map((m: string) => (
                        <option key={m} value={m} className="bg-[#181b21]">
                            {m}
                        </option>
                    ))}
                </select>
                <p className="text-[10px] text-[#6e6e73] mt-1">{def.modelHelp}</p>
            </div>

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
