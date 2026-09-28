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
  api_key_env: z.string().default("ONESHOT_API_TOKEN"),
  header_name: z.string().default("authorization"),
});

export const SecurityHeadersConfigSchema = z.object({
  enabled: z.boolean().default(true),
  content_security_policy: z.string().default("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"),
  x_content_type_options: z.string().default("nosniff"),
  x_frame_options: z.string().default("DENY"),
  strict_transport_security: z.string().default("max-age=31536000; includeSubDomains"),
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
    api_key_env: "ONESHOT_API_TOKEN",
    header_name: "authorization",
  }),
  headers: SecurityHeadersConfigSchema.default({
    enabled: true,
    content_security_policy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
    x_content_type_options: "nosniff",
    x_frame_options: "DENY",
    strict_transport_security: "max-age=31536000; includeSubDomains",
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
  reasoning: z.string().default("mistral-large-latest"),
  fast: z.string().default("gemini-2.5-flash"),
  coding: z.string().default("mistral-large-latest"),
  critic: z.string().default("mistral-large-latest"),
  vision: z.string().default("gemini-2.5-flash"),
  local: z.string().default("llama3.2"),
});

export const ModelsConfigSchema = z.object({
  default_provider: z.string().default("mistral"),
  fallback_provider: z.string().default("gemini"),
  roles: ModelRolesSchema.default({
    reasoning: "mistral-large-latest",
    fast: "gemini-2.5-flash",
    coding: "mistral-large-latest",
    critic: "mistral-large-latest",
    vision: "gemini-2.5-flash",
    local: "llama3.2",
  }),
  providers: z.array(ModelProviderSchema).default([]),
});

export const BobGuidanceConfigSchema = z.object({
  context_mentions: z.array(z.string()).default([
    "@workspace",
    "@file",
    "@folder",
    "@diff",
    "@terminal",
    "@web",
    "@docs",
  ]),
  human_in_the_loop: z.object({
    gate_1_research_review: z.boolean().default(true),
    gate_2_build_ready: z.boolean().default(true),
  }).default({
    gate_1_research_review: true,
    gate_2_build_ready: true,
  }),
  streaming_tool_status: z.object({
    enabled: z.boolean().default(true),
    stages: z.array(z.string()).default(["tool_pending", "tool_running", "tool_result", "tool_error"]),
    track_duration_ms: z.boolean().default(true),
    render_json_fallback: z.boolean().default(true),
  }).default({
    enabled: true,
    stages: ["tool_pending", "tool_running", "tool_result", "tool_error"],
    track_duration_ms: true,
    render_json_fallback: true,
  }),
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
      api_key_env: "ONESHOT_API_TOKEN",
      header_name: "authorization",
    },
    headers: {
      enabled: true,
      content_security_policy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
      x_content_type_options: "nosniff",
      x_frame_options: "DENY",
      strict_transport_security: "max-age=31536000; includeSubDomains",
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
      reasoning: "mistral-large-latest",
      fast: "gemini-2.5-flash",
      coding: "mistral-large-latest",
      critic: "mistral-large-latest",
      vision: "gemini-2.5-flash",
      local: "llama3.2",
    },
    providers: [],
  }),
  bob_guidance: BobGuidanceConfigSchema.default({
    context_mentions: [
      "@workspace",
      "@file",
      "@folder",
      "@diff",
      "@terminal",
      "@web",
      "@docs",
    ],
    human_in_the_loop: {
      gate_1_research_review: true,
      gate_2_build_ready: true,
    },
    streaming_tool_status: {
      enabled: true,
      stages: ["tool_pending", "tool_running", "tool_result", "tool_error"],
      track_duration_ms: true,
      render_json_fallback: true,
    },
  }),
});

export type OneShotConfig = z.infer<typeof OneShotConfigSchema>;
export type ModelProvider = z.infer<typeof ModelProviderSchema>;
