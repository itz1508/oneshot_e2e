import React, { useState, useEffect, useCallback } from "react";
import { useOverlayFocus } from "../../lib/useOverlayFocus";
import { AuthloginGemini } from "./Authlogin/Gemini";
import { ModelGemini } from "./Model/Gemini";
import { ModelOpenAI } from "./Model/OpenAI";
import { ProviderId } from "../../types";

interface IntegrationProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId?: string;
    currentProvider?: ProviderId;
    currentModel?: string;
    onProviderSwitch?: (provider: ProviderId, model: string) => void;
}

type Tab = "auth" | "models";

/**
 * Integration drawer — modular container for auth and model provider cards.
 * Each card (Authlogin/Gemini, Model/Gemini, Model/OpenAI) is an independent module.
 */
export const Integration: React.FC<IntegrationProps> = ({
    isOpen,
    onClose,
    sessionId,
    currentProvider,
    currentModel,
    onProviderSwitch,
}) => {
    const [activeTab, setActiveTab] = useState<Tab>("models");
    const [activeProvider, setActiveProvider] = useState<ProviderId>(currentProvider || "gemini");
    const [activeModel, setActiveModel] = useState<string | undefined>(currentModel);
    const integrationRef = useOverlayFocus<HTMLElement>(isOpen, onClose);

    // Sync with external props
    useEffect(() => {
        if (currentProvider) setActiveProvider(currentProvider);
        if (currentModel) setActiveModel(currentModel);
    }, [currentProvider, currentModel]);

    const handleProviderSwitch = useCallback(
        (provider: "gemini" | "openai", model: string) => {
            setActiveProvider(provider);
            setActiveModel(model);
            onProviderSwitch?.(provider, model);
        },
        [onProviderSwitch]
    );

    // Focus is managed by the shared overlay hook.

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Drawer panel */}
            <aside
              ref={integrationRef}
              className="fixed right-0 top-0 h-[100dvh] w-[min(360px,100vw)] z-50 bg-[#0f1117] border-l border-white/10 flex flex-col shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Integration settings"
              inert={!isOpen}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <div>
                        <h2 className="text-sm font-semibold text-[#f2f2f3]">Integrations</h2>
                        <p className="text-[10px] text-[#838d9a] mt-0.5">
                            Auth &amp; model provider configuration
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg grid place-items-center text-[#838d9a] hover:text-white hover:bg-white/10 transition-colors"
                        aria-label="Close integrations panel"
                    >
                        ✕
                    </button>
                </div>

                {/* Active provider indicator */}
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#62c48d] shrink-0" aria-hidden="true" />
                    <span className="text-[10px] text-[#838d9a]">
                        Active: <span className="text-[#f2f2f3] font-medium">{activeProvider}</span>
                        {activeModel && (
                            <> · <span className="font-mono text-[#a0b0c8]">{activeModel}</span></>
                        )}
                    </span>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10 px-4">
                    {(["models", "auth"] as Tab[]).map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`h-9 px-3 text-xs font-medium capitalize border-b-2 transition-colors -mb-px ${
                                activeTab === tab
                                    ? "border-[#79a8ea] text-[#79a8ea]"
                                    : "border-transparent text-[#838d9a] hover:text-[#c7c7cc]"
                            }`}
                            aria-selected={activeTab === tab}
                            role="tab"
                        >
                            {tab === "models" ? "Model Providers" : "Authentication"}
                        </button>
                    ))}
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 overscroll-contain">
                    {activeTab === "models" && (
                        <>
                            <p className="text-[10px] text-[#838d9a] leading-relaxed">
                                Select and apply a model provider for this session.
                                API keys are managed server-side in{" "}
                                <code className="font-mono text-[#ececec]">app/env/.env</code>.
                            </p>
                            <ModelGemini
                                sessionId={sessionId}
                                currentModel={activeProvider === "gemini" ? activeModel : undefined}
                                onProviderSwitch={handleProviderSwitch}
                            />
                            <ModelOpenAI
                                sessionId={sessionId}
                                currentModel={activeProvider === "openai" ? activeModel : undefined}
                                onProviderSwitch={handleProviderSwitch}
                            />
                        </>
                    )}

                    {activeTab === "auth" && (
                        <>
                            <p className="text-[10px] text-[#838d9a] leading-relaxed">
                                Connect identity providers for authenticated access.
                                Credentials stay strictly server-side.
                            </p>
                            <AuthloginGemini
                                sessionId={sessionId}
                                onAuthChange={(authenticated) => {
                                    // Could propagate auth state to parent if needed
                                    console.log("Gemini auth:", authenticated);
                                }}
                            />
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between text-[10px] text-[#6e6e73]">
                    <span>Credentials are never exposed to the browser</span>
                    <span className="text-[#838d9a]">SERVER-OWNED</span>
                </div>
            </aside>
        </>
    );
};
