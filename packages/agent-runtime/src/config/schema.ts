/**
 * OneShot Configuration Schemas & Strongly Typed Model Definitions
 * Validated via Zod with comprehensive defaults.
 */

import { z } from "zod";

export const AppConfigSchema = z.object({
  name: z.string().default("OneShot Agent Runtime"),
  version: z.string().default("1.3.0"),
  environment: z.enum(["development", "test", "production"]).default("production"),
});

export const ServerConfigSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.number().int().positive().default(8787),
  request_max_bytes: z.number().int().positive().default(10 * 1024 * 1024), // 10MB default
  body_timeout_ms: z.number().int().positive().default(30000),
  cors_allowed_origins: z.array(z.string()).default(["*"]),
});

export const RateLimitingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  max_requests_per_minute: z.number().int().positive().default(120),
  burst_limit: z.number().int().positive().default(30),
  window_seconds: z.number().int().positive().default(60),
});

export const AuthConfigSchema = z.object({
  enabled: z.boolean().default(false),
  // Field names are camelCase to match the AuthGuardOptions consumed at
  // request time. z.object() strips unknown keys, so a snake_case spelling in
  // config.toml would be silently discarded and replaced by these defaults.
  apiKeyEnv: z.string().default("ONESHOT_API_TOKEN"),
  headerName: z.string().default("authorization"),
});

export const SecurityHeadersConfigSchema = z.object({
  enabled: z.boolean().default(true),
  // camelCase to match SecurityHeadersOptions. See AuthConfigSchema note.
  contentSecurityPolicy: z.string().default("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"),
  xContentTypeOptions: z.string().default("nosniff"),
  xFrameOptions: z.string().default("DENY"),
  strictTransportSecurity: z.string().default("max-age=31536000; includeSubDomains"),
});

export const SecurityConfigSchema = z.object({
  rate_limiting: RateLimitingConfigSchema.default({
    enabled: true,
    max_requests_per_minute: 120,
    burst_limit: 30,
    window_seconds: 60,
  }),
  auth: AuthConfigSchema.default({
    enabled: false,
    apiKeyEnv: "ONESHOT_API_TOKEN",
    headerName: "authorization",
  }),
  headers: SecurityHeadersConfigSchema.default({
    enabled: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
    xContentTypeOptions: "nosniff",
    xFrameOptions: "DENY",
    strictTransportSecurity: "max-age=31536000; includeSubDomains",
  }),
});

export const SandboxPartitionSchema = z.object({
  name: z.string(),
  path: z.string(),
  description: z.string().optional(),
});

export const SandboxConfigSchema = z.object({
  virtual_mode: z.boolean().default(true),
  max_file_size_bytes: z.number().int().positive().default(50 * 1024 * 1024), // 50MB
  partitions: z.array(SandboxPartitionSchema).default([
    { name: "workspace", path: "/workspace", description: "Physical repository root" },
    { name: "scratch", path: "/scratch", description: "Ephemeral RAM scratchpad" },
    { name: "memories", path: "/memories", description: "Cross-turn persistent knowledge" },
    { name: "artifacts", path: "/artifacts", description: "Immutable deliverable staging" },
  ]),
});

export const GeminiSafetySettingSchema = z.object({
  category: z.string(),
  threshold: z.string(),
});

export const ModelProviderSchema = z.object({
  name: z.string(),
  priority: z.number().int().default(50),
  baseUrl: z.string(),
  defaultModel: z.string(),
  models: z.array(z.string()).min(1),
  envKey: z.string(),
  explicit: z.boolean().default(false), // UV-index pattern: explicit = true requires explicit role/caller selection
  fallback: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  safetySettings: z.array(GeminiSafetySettingSchema).optional(),
});

export const ModelRolesSchema = z.object({
  reasoning: z.string().default("ministral-8b-latest"),
  fast: z.string().default("gemini-2.5-flash"),
  coding: z.string().default("ministral-8b-latest"),
  critic: z.string().default("ministral-8b-latest"),
  vision: z.string().default("gemini-2.5-flash"),
  local: z.string().default("llama3.2"),
});

export const ModelsConfigSchema = z.object({
  default_provider: z.string().default("mistral"),
  fallback_provider: z.string().default("gemini"),
  roles: ModelRolesSchema.default({
    reasoning: "ministral-8b-latest",
    fast: "gemini-2.5-flash",
    coding: "ministral-8b-latest",
    critic: "ministral-8b-latest",
    vision: "gemini-2.5-flash",
    local: "llama3.2",
  }),
  providers: z.array(ModelProviderSchema).default([]),
});

export const OneShotConfigSchema = z.object({
  app: AppConfigSchema.default({
    name: "OneShot Agent Runtime",
    version: "1.3.0",
    environment: "production",
  }),
  server: ServerConfigSchema.default({
    host: "0.0.0.0",
    port: 8787,
    request_max_bytes: 10 * 1024 * 1024,
    body_timeout_ms: 30000,
    cors_allowed_origins: ["*"],
  }),
  security: SecurityConfigSchema.default({
    rate_limiting: {
      enabled: true,
      max_requests_per_minute: 120,
      burst_limit: 30,
      window_seconds: 60,
    },
    auth: {
      enabled: false,
      apiKeyEnv: "ONESHOT_API_TOKEN",
      headerName: "authorization",
    },
    headers: {
      enabled: true,
      contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
      xContentTypeOptions: "nosniff",
      xFrameOptions: "DENY",
      strictTransportSecurity: "max-age=31536000; includeSubDomains",
    },
  }),
  sandbox: SandboxConfigSchema.default({
    virtual_mode: true,
    max_file_size_bytes: 50 * 1024 * 1024,
    partitions: [
      { name: "workspace", path: "/workspace", description: "Physical repository root" },
      { name: "scratch", path: "/scratch", description: "Ephemeral RAM scratchpad" },
      { name: "memories", path: "/memories", description: "Cross-turn persistent knowledge" },
      { name: "artifacts", path: "/artifacts", description: "Immutable deliverable staging" },
    ],
  }),
  models: ModelsConfigSchema.default({
    default_provider: "mistral",
    fallback_provider: "gemini",
    roles: {
      reasoning: "ministral-8b-latest",
      fast: "gemini-2.5-flash",
      coding: "ministral-8b-latest",
      critic: "ministral-8b-latest",
      vision: "gemini-2.5-flash",
      local: "llama3.2",
    },
    providers: [],
  }),
});

export type OneShotConfig = z.infer<typeof OneShotConfigSchema>;
export type ModelProvider = z.infer<typeof ModelProviderSchema>;
