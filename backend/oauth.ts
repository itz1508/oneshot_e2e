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
   * Exchange OAuth code for access token
   * Simulated here; in production, call Google OAuth token endpoint
   */
  async exchangeCodeForToken(code: string, state: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    user: { id: string; email: string; name: string };
  }> {
    // In production, this would validate state and call:
    // POST https://oauth2.googleapis.com/token
    // with code, client_id, client_secret, grant_type, redirect_uri

    // For now, simulate successful token exchange
    if (!code || code.length < 4) {
      throw new Error("Invalid authorization code");
    }

    // Simulated Google OAuth response
    return {
      accessToken: `goog_${crypto.randomBytes(16).toString("hex")}`,
      refreshToken: `refresh_${crypto.randomBytes(16).toString("hex")}`,
      user: {
        id: `google_${Date.now()}`,
        email: "user@gmail.com",
        name: "OneShot User",
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

    // In production, revoke token at Google:
    // POST https://oauth2.googleapis.com/revoke
    // with token=accessToken

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
