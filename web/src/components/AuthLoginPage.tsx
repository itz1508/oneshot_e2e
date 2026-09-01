import { useState, type FormEvent } from "react";
import { login } from "../agent/authApi";

export interface AuthLoginPageProps {
  onAuthenticated: () => void;
}

/**
 * Operator sign-in form shown by App.tsx when the backend requires
 * authentication (`ONESHOT_API_TOKEN` is set) and no valid session exists.
 *
 * The entered token is exchanged for a short-lived session cookie + CSRF token;
 * the token itself is never persisted by the IDE.
 */
export function AuthLoginPage({ onAuthenticated }: AuthLoginPageProps) {
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(token.trim());
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "#0b0f14",
        margin: 0,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          padding: "2rem",
          border: "1px solid #2a3038",
          borderRadius: "0.5rem",
          background: "#141820",
          minWidth: "20rem",
          maxWidth: "28rem",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>OneShot — sign in</h1>
        <p
          style={{
            margin: 0,
            fontSize: "0.8rem",
            color: "#9aa3b8",
            lineHeight: 1.4,
          }}
        >
          Enter the operator's ONESHOT_API_TOKEN to establish a browser session.
          The token is exchanged for a short-lived, CSRF-protected session
          cookie and is never stored or sent to any other origin.
        </p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ONESHOT_API_TOKEN"
          disabled={submitting}
          required
          style={{ padding: "0.5rem", fontSize: "0.9rem", borderRadius: "0.25rem" }}
        />
        {error && (
          <div style={{ color: "#ff6b6b", fontSize: "0.8rem" }}>{error}</div>
        )}
        <button
          type="submit"
          disabled={submitting || !token.trim()}
          style={{
            padding: "0.5rem",
            fontSize: "0.9rem",
            borderRadius: "0.25rem",
            cursor: submitting || !token.trim() ? "default" : "pointer",
          }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
