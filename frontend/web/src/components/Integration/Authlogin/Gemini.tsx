import React, { useState, useEffect } from "react";
import { ApiResponseError, readJsonResponse, resolveApiUrl } from "../../../lib/api";

interface GeminiAuthState {
    status: "idle" | "checking" | "authenticated" | "unauthenticated" | "error";
    user?: { email: string; name: string };
    error?: string;
}

interface AuthloginGeminiProps {
    sessionId?: string;
    onAuthChange?: (authenticated: boolean) => void;
}

/**
 * Authlogin/Gemini — Independent Google OAuth authentication card.
 * Connects to /api/auth/google/* endpoints.
 * Credentials stay server-side per OneShot security invariants.
 */
export const AuthloginGemini: React.FC<AuthloginGeminiProps> = ({
    sessionId,
    onAuthChange,
}) => {
    const [state, setState] = useState<GeminiAuthState>({ status: "idle" });
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // Check current auth status on mount
    useEffect(() => {
        checkAuthStatus();
    }, [sessionId]);

    const checkAuthStatus = async () => {
        setState((s) => ({ ...s, status: "checking" }));
        try {
            const headers: Record<string, string> = {};
            if (sessionId) headers["X-Session-Id"] = sessionId;

            const res = await fetch(resolveApiUrl("/api/auth/google/status"), { headers });
            const data = await readJsonResponse<{ isAuthenticated?: boolean; user?: { email: string; name: string } }>(res, "Google auth status request");
            if (data.isAuthenticated !== true || !data.user) {
                throw new Error("Google auth status response is missing an authenticated user");
            }
            setState({ status: "authenticated", user: data.user });
            onAuthChange?.(true);
        } catch (error) {
            if (error instanceof ApiResponseError && error.status === 401) {
                setState({ status: "unauthenticated" });
                onAuthChange?.(false);
                return;
            }
            setState({ status: "error", error: error instanceof Error ? error.message : "Unable to read Google authentication status." });
        }
    };

    const handleLogin = async () => {
        setIsLoggingIn(true);
        setState((s) => ({ ...s, error: undefined }));
        try {
            // Get the OAuth redirect URI from backend
            const res = await fetch(resolveApiUrl("/api/auth/google/init"));
            const data = await readJsonResponse<{ redirectUri?: string; state?: string }>(res, "Google OAuth init request");
            if (!data.redirectUri || !data.state) {
                throw new Error("Google OAuth init response is missing redirectUri or state");
            }

            // If client_id is the placeholder, show config message
            if (data.redirectUri.includes("YOUR_CLIENT_ID")) {
                setState({
                    status: "error",
                    error: "Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID in app/env/.env",
                });
                return;
            }

            // Open OAuth flow in same window
            window.location.href = data.redirectUri;
        } catch (err: any) {
            setState({
                status: "error",
                error: err.message || "Failed to initiate OAuth flow",
            });
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleLogout = async () => {
        try {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (sessionId) headers["X-Session-Id"] = sessionId;

            const response = await fetch(resolveApiUrl("/api/auth/google/logout"), { method: "POST", headers });
            const data = await readJsonResponse<{ success?: boolean; message?: string }>(response, "Google logout request");
            if (data.success !== true) {
                throw new Error("Google logout response did not confirm logout");
            }
            setState({ status: "unauthenticated" });
            onAuthChange?.(false);
        } catch (err: any) {
            setState((s) => ({ ...s, error: err.message }));
        }
    };

    const isAuthenticated = state.status === "authenticated";
    const isChecking = state.status === "checking";

    return (
        <div
            className="rounded-xl border border-white/10 bg-[#181b21] p-4 space-y-3"
            role="region"
            aria-label="Google Authentication"
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <span
                        className="w-7 h-7 rounded-lg grid place-items-center text-sm font-bold shrink-0"
                        style={{ background: "linear-gradient(135deg, #4285f4, #9b72cb 50%, #ea4335)" }}
                        aria-hidden="true"
                    >
                        G
                    </span>
                    <div>
                        <div className="text-xs font-semibold text-[#f2f2f3]">Google</div>
                        <div className="text-[10px] text-[#838d9a]">OAuth 2.0 + PKCE</div>
                    </div>
                </div>

                {/* Status badge */}
                <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        isAuthenticated
                            ? "bg-[#62c48d]/15 text-[#62c48d] border-[#62c48d]/40"
                            : isChecking
                            ? "bg-white/5 text-[#8e8e93] border-white/10"
                            : "bg-white/5 text-[#8e8e93] border-white/10"
                    }`}
                >
                    {isAuthenticated ? "Connected" : isChecking ? "Checking..." : "Not connected"}
                </span>
            </div>

            {/* Authenticated state */}
            {isAuthenticated && state.user && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#62c48d]/10 border border-[#62c48d]/20">
                    <div className="min-w-0">
                        <div className="text-xs font-medium text-[#f2f2f3] truncate">
                            {state.user.name}
                        </div>
                        <div className="text-[10px] text-[#838d9a] truncate">{state.user.email}</div>
                    </div>
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="ml-2 h-6 px-2 rounded-md text-[10px] text-[#e5534b] hover:bg-[#e5534b]/10 border border-[#e5534b]/20 transition-colors shrink-0 font-medium"
                    >
                        Sign out
                    </button>
                </div>
            )}

            {/* Unauthenticated / error state */}
            {!isAuthenticated && (
                <div className="space-y-2">
                    {state.error && (
                        <div className="p-2.5 rounded-lg border border-[#e5a84b]/30 bg-[#e5a84b]/10 text-[11px] text-[#e5a84b]">
                            {state.error}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handleLogin}
                        disabled={isLoggingIn || isChecking}
                        className="w-full h-8 rounded-lg border border-white/15 bg-[#262b34] hover:bg-[#2f3640] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-[#f2f2f3] transition-colors flex items-center justify-center gap-2"
                        aria-busy={isLoggingIn}
                    >
                        {isLoggingIn ? (
                            <span>Redirecting to Google...</span>
                        ) : (
                            <>
                                <span style={{ background: "linear-gradient(135deg,#4285f4,#ea4335)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                                    G
                                </span>
                                <span>Sign in with Google</span>
                            </>
                        )}
                    </button>
                    <p className="text-[10px] text-[#6e6e73] text-center">
                        Requires GOOGLE_OAUTH_CLIENT_ID in app/env/.env
                    </p>
                </div>
            )}

            {/* Refresh button */}
            {!isChecking && (
                <button
                    type="button"
                    onClick={checkAuthStatus}
                    className="text-[10px] text-[#8e8e93] hover:text-[#c7c7cc] transition-colors"
                    aria-label="Refresh authentication status"
                >
                    ↻ Refresh status
                </button>
            )}
        </div>
    );
};
