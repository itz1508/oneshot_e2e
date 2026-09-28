/**
 * OneShot In-Memory Sliding-Window Rate Limiter
 * 
 * Provides per-client-IP and per-session rate limiting.
 * Returns standard RFC rate limit headers and 429 Too Many Requests.
 */

import type http from "node:http";

interface RateLimitRecord {
  timestamps: number[];
}

export interface RateLimiterOptions {
  enabled?: boolean;
  maxRequestsPerMinute?: number;
  windowSeconds?: number;
}

export class SlidingWindowRateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private enabled: boolean;
  private maxRequests: number;
  private windowMs: number;

  constructor(options: RateLimiterOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.maxRequests = options.maxRequestsPerMinute ?? 120;
    this.windowMs = (options.windowSeconds ?? 60) * 1000;

    // Prune stale records every 2 minutes
    setInterval(() => this.pruneStale(), 120000).unref();
  }

  public checkLimit(key: string): {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetSeconds: number;
  } {
    if (!this.enabled) {
      return { allowed: true, limit: this.maxRequests, remaining: this.maxRequests, resetSeconds: 0 };
    }

    const now = Date.now();
    const windowStart = now - this.windowMs;

    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    // Filter out timestamps outside the sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    const count = record.timestamps.length;
    const remaining = Math.max(0, this.maxRequests - count);
    const oldest = record.timestamps[0] || now;
    const resetSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));

    if (count >= this.maxRequests) {
      return { allowed: false, limit: this.maxRequests, remaining: 0, resetSeconds };
    }

    record.timestamps.push(now);
    return { allowed: true, limit: this.maxRequests, remaining: remaining - 1, resetSeconds };
  }

  public getClientKey(req: http.IncomingMessage): string {
    const sessionId = (req.headers["x-session-id"] as string) || "";
    if (sessionId) return `session:${sessionId}`;

    const forwarded = (req.headers["x-forwarded-for"] as string) || "";
    const ip = forwarded.split(",")[0]?.trim() || req.socket.remoteAddress || "127.0.0.1";
    return `ip:${ip}`;
  }

  private pruneStale(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [key, record] of this.records.entries()) {
      record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
      if (record.timestamps.length === 0) {
        this.records.delete(key);
      }
    }
  }
}
