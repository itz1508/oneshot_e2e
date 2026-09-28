/**
 * OneShot Model Client Cache — Singleton Model Instance Management
 *
 * Reuses OpenAIModel instances per provider+model+baseUrl combination
 * to avoid per-call construction overhead, enabling connection pooling
 * and warm HTTP keep-alive on the underlying openai client.
 *
 * Cache entries expire after a configurable TTL (default 30 minutes)
 * and can be explicitly invalidated on credential rotation.
 */

import { OpenAIModel } from "@strands-agents/sdk/models/openai"

export interface CacheEntry {
  model: OpenAIModel
  createdAt: number
  lastUsedAt: number
  hitCount: number
}

export interface ClientCacheOptions {
  /** Maximum time-to-live for cached clients (ms). Default: 30 minutes. */
  ttlMs?: number
  /** Maximum number of cached clients. Default: 20. */
  maxEntries?: number
}

const DEFAULT_TTL_MS = 30 * 60 * 1000
const DEFAULT_MAX_ENTRIES = 20

/**
 * Generates a deterministic cache key from model construction parameters.
 * Intentionally excludes the API key value from the key string for security,
 * but includes a hash prefix to differentiate credentials.
 */
function buildCacheKey(
  provider: string,
  modelId: string,
  baseUrl: string,
  apiKeyPrefix: string
): string {
  // Use first 8 chars of API key as a differentiator without exposing the full key
  const keyPrefix = apiKeyPrefix.slice(0, 8).replace(/[^a-zA-Z0-9]/g, '_')
  return `${provider}::${modelId}::${baseUrl}::${keyPrefix}`
}

export class ModelClientCache {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly ttlMs: number
  private readonly maxEntries: number

  constructor(options: ClientCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  }

  get size(): number {
    return this.cache.size
  }

  /**
   * Retrieves a cached OpenAIModel instance or creates and caches a new one.
   */
  getOrCreate(
    provider: string,
    modelId: string,
    apiKey: string,
    baseUrl: string,
    extraConfig?: Record<string, unknown>
  ): OpenAIModel {
    const key = buildCacheKey(provider, modelId, baseUrl, apiKey)

    const existing = this.cache.get(key)
    if (existing && (Date.now() - existing.createdAt) < this.ttlMs) {
      existing.lastUsedAt = Date.now()
      existing.hitCount++
      return existing.model
    }

    // Evict expired or LRU entries if at capacity
    if (this.cache.size >= this.maxEntries) {
      this.evictLru()
    }

    const model = new OpenAIModel({
      api: "chat",
      modelId,
      apiKey,
      clientConfig: {
        baseURL: baseUrl,
        timeout: 60_000,
        maxRetries: 3,
        ...extraConfig,
      },
    })

    this.cache.set(key, {
      model,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      hitCount: 0,
    })

    return model
  }

  /**
   * Invalidates all cached clients for a given provider.
   * Use when API keys are rotated or provider configuration changes.
   */
  invalidateProvider(provider: string): number {
    let evicted = 0
    for (const [key] of this.cache) {
      if (key.startsWith(`${provider}::`)) {
        this.cache.delete(key)
        evicted++
      }
    }
    return evicted
  }

  /**
   * Invalidates all cached clients.
   */
  invalidateAll(): void {
    this.cache.clear()
  }

  /**
   * Returns cache statistics for observability.
   */
  stats(): { size: number, providers: string[] } {
    const providers = new Set<string>()
    for (const key of this.cache.keys()) {
      const provider = key.split("::")[0]
      if (provider) providers.add(provider)
    }
    return {
      size: this.cache.size,
      providers: [...providers],
    }
  }

  /**
   * Evicts the least-recently-used entry.
   */
  private evictLru(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache) {
      if (entry.lastUsedAt < oldestTime) {
        oldestTime = entry.lastUsedAt
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }
}

/** Global singleton cache instance */
let _globalCache: ModelClientCache | null = null

export function getModelClientCache(options?: ClientCacheOptions): ModelClientCache {
  if (!_globalCache) {
    _globalCache = new ModelClientCache(options)
  }
  return _globalCache
}
