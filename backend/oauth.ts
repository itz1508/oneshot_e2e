/**
 * OAuth Manager — Google OAuth 2.0 with PKCE
 * Handles token exchange, session management, and security
 */

import crypto from "node:crypto";

export interface UserSession {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export class OAuthManager {
  private sessions: Map<string, UserSession> = new Map();
  private sessionTTL: number = 24 * 60 * 60 * 1000; // 24 hours
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired sessions every hour
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000);
  }

  /**
   * Generate cryptographically secure random session ID
   */
  generateSessionId(): string {
    return `sess_${crypto.randomBytes(16).toString("hex")}`;
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  generatePKCE(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");
    return { verifier, challenge };
  }

  /**
   * Generate CSRF state token
   */
  generateStateToken(): string {
    return crypto.randomBytes(16).toString("hex");
  }

  /**
   * Exchange OAuth code for access token with Google OAuth token endpoint.
   * Fails fast if credentials are not configured rather than returning simulated tokens.
   */
  async exchangeCodeForToken(code: string, state: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    user: { id: string; email: string; name: string };
  }> {
    if (!code || code.length < 4) {
      throw new Error("Invalid authorization code");
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:3000/auth/callback";

    if (!clientId || !clientSecret || clientId === "YOUR_CLIENT_ID") {
      throw new Error(
        "Google OAuth credentials (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET) are unconfigured. Mock token exchange is absent from production."
      );
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Google OAuth token exchange failed (${tokenRes.status}): ${errText}`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
    };

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      throw new Error(`Failed to retrieve user profile from Google (${userRes.status})`);
    }

    const userInfo = (await userRes.json()) as { id: string; email: string; name: string };

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
      },
    };
  }

  /**
   * Create a new session after successful OAuth
   */
  createSession(user: { id: string; email: string; name: string }, accessToken: string): UserSession {
    const sessionId = this.generateSessionId();
    const expiresAt = Date.now() + this.sessionTTL;

    const session: UserSession = {
      sessionId,
      userId: user.id,
      email: user.email,
      name: user.name,
      accessToken,
      expiresAt,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Retrieve session by ID
   */
  getSession(sessionId: string): UserSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    // Check if expired
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Validate session and extend TTL
   */
  validateSession(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;

    // Extend TTL on successful validation
    session.expiresAt = Date.now() + this.sessionTTL;
    this.sessions.set(sessionId, session);

    return true;
  }

  /**
   * Destroy session (logout)
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.accessToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(session.accessToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch {
        // Best effort token revocation
      }
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Get total active sessions (for monitoring)
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Shutdown: stop cleanup interval
   */
  shutdown(): void {
    clearInterval(this.cleanupInterval);
  }
}

// Export singleton instance
export const oauthManager = new OAuthManager();
