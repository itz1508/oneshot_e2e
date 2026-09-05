/**
 * Shared Redis connection for BullMQ infrastructure.
 *
 * Architecture role: Redis is used ONLY for BullMQ scheduling + live queue
 * transport. It is never the permanent source of truth for completed runs
 * (RunRepository is). The ioredis instance is shared by Queue, Worker, and
 * QueueEvents to avoid duplicate sockets.
 *
 * BullMQ v6 note: connection errors are EMITTED as 'error' events, not thrown
 * synchronously. An unhandled 'error' event on an EventEmitter crashes the
 * Node process, so every connection created here always attaches an error
 * listener that records a sanitized message instead of crashing.
 *
 * Connection string parsing accepts REDIS_URL forms:
 *   redis://[:password@]host[:port][/db]
 *   rediss://...            (TLS)
 */

import * as IORedisNS from "ioredis";
import type { Redis, RedisOptions } from "ioredis";
import type { ConnectionOptions } from "bullmq";

export const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

/**
 * ioredis v6 exposes its constructor through a `default` export whose shape
 * differs between CJS and ESM interop. Resolve the callable constructor once,
 * defensively, so the module works under both module systems.
 */
function redisCtor(): new (opts?: RedisOptions) => Redis {
  const mod = IORedisNS as unknown as {
    default?: new (opts?: RedisOptions) => Redis;
  };
  return (
    mod.default ??
    (IORedisNS as unknown as new (opts?: RedisOptions) => Redis)
  );
}

/** Resolve the Redis URL from the environment (never logged verbatim). */
export function resolveRedisUrl(): string {
  return process.env.REDIS_URL || DEFAULT_REDIS_URL;
}

/**
 * Parse a redis:// URL into ioredis options. Falls back to a safe local
 * default when the URL is unparseable. The password is carried in the
 * returned options (never logged).
 */
export function parseRedisUrl(rawUrl: string): RedisOptions {
  try {
    const u = new URL(rawUrl);
    const opts: RedisOptions = {
      host: u.hostname || "127.0.0.1",
      port: u.port ? Number(u.port) : 6379,
      db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      // Backoff reconnect attempts when Redis is persistently unreachable so a
      // down server is probed with increasing delay (200ms..5s) instead of a
      // rapid reconnect storm that floods error logs (see queue.ts logQueueError).
      retryStrategy: (times: number) =>
        Math.min(Math.max(times, 1) * 200, 5000),
    };
    if (u.password) opts.password = u.password;
    if (u.username) opts.username = u.username;
    if (u.protocol === "rediss:") opts.tls = {};
    return opts;
  } catch {
    return {
      host: "127.0.0.1",
      port: 6379,
      db: 0,
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      retryStrategy: (times: number) =>
        Math.min(Math.max(times, 1) * 200, 5000),
    };
  }
}

/** Parse the REDIS_URL env var (or default) into ioredis options. */
export function resolveRedisOptions(): RedisOptions {
  return parseRedisUrl(resolveRedisUrl());
}

/**
 * The BullMQ ConnectionOptions shape for this deployment: a plain
 * RedisOptions object that BullMQ passes to ioredis. BullMQ requires
 * maxRetriesPerRequest: null so blocking commands work; we keep it.
 */
export function resolveRedisConnection(): ConnectionOptions {
  return resolveRedisOptions() as unknown as ConnectionOptions;
}

type ErrorListener = (err: Error) => void;

let redisInstance: Redis | null = null;
let producerInstance: Redis | null = null;
const errorListeners = new Set<ErrorListener>();

function handleRedisError(err: Error): void {
  // Never log the connection string or credential details — emit a sanitized
  // message only (connection errors can embed host info; that is kept,
  // passwords never appear in connection error messages).
  const msg = String(err?.message || err);
  for (const l of errorListeners) l(err);
  if (process.env.ONESHOT_LOG_LEVEL?.toLowerCase() === "debug") {
    console.warn(`[redis] connection error: ${msg}`);
  }
}

/**
 * Return the shared ioredis instance for blocking consumers (Worker,
 * QueueEvents). Lazily created so a missing Redis server only matters when
 * queueing is actually used. The returned instance already has an 'error'
 * listener attached (BullMQ v6 emits errors instead of throwing), so
 * consumers may attach additional listeners freely.
 */
export function getSharedRedis(): Redis {
  if (!redisInstance) {
    const Ctor = redisCtor();
    redisInstance = new Ctor(resolveRedisOptions());
    redisInstance.on("error", handleRedisError);
  }
  return redisInstance;
}

/**
 * Dedicated connection for the enqueue (producer) side with the offline
 * queue DISABLED: when Redis is unreachable, `queue.add` rejects immediately
 * instead of silently retaining the command until reconnect. This prevents a
 * timed-out enqueue from being delivered later and double-executing a run
 * that already fell back to inline execution.
 */
export function getProducerRedis(): Redis {
  if (!producerInstance) {
    const Ctor = redisCtor();
    producerInstance = new Ctor({
      ...resolveRedisOptions(),
      enableOfflineQueue: false,
    });
    producerInstance.on("error", handleRedisError);
  }
  return producerInstance;
}

/** Observe (sanitized) connection errors from the shared connection. */
export function onRedisError(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

/**
 * Promise that resolves as soon as the shared connection is live, or rejects
 * on the first error if `failFast` is set. Used at bootstrap to decide
 * between queue-backed and inline run execution.
 */
export function whenRedisReady(timeoutMs = 5000): Promise<void> {
  const client = getSharedRedis();
  if (client.status === "ready") {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("redis connection timeout"));
    }, timeoutMs);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      client.off("ready", onReady);
      client.off("error", onError);
    };
    client.once("ready", onReady);
    client.once("error", onError);
  });
}

export function closeSharedRedis(): void {
  if (redisInstance) {
    try {
      redisInstance.disconnect();
    } catch {
      /* ignore */
    }
    redisInstance = null;
  }
  if (producerInstance) {
    try {
      producerInstance.disconnect();
    } catch {
      /* ignore */
    }
    producerInstance = null;
  }
}
