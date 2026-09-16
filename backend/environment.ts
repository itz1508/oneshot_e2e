import { existsSync } from "node:fs";
import { resolve } from "node:path";

const environmentFile = resolve(process.cwd(), "app", "env", ".env");
if (existsSync(environmentFile)) {
  if (typeof process.loadEnvFile !== "function") {
    throw new Error(
      "ROOT_CAUSE: loading .env requires Node.js 20.12+; set variables in the process environment instead",
    );
  }
  process.loadEnvFile(environmentFile);
}

/**
 * M11 credential policy variables (read from the environment by
 * `backend/security/deployment-posture.ts` at use time; NO secret values are
 * read here):
 *   ONESHOT_BIND_HOST             — bind host; loopback enables session credentials
 *   ONESHOT_MODE / NODE_ENV       — "production" disables legacy key bridges
 *   ONESHOT_LOCAL_CREDENTIAL_SESSION — "true" opts into loopback session credentials (non-production)
 *   ONESHOT_REQUIRE_AUTH          — "true" declares an authenticated principal exists
 *   ONESHOT_REQUIRE_REDIS         — "true" makes readiness fail instead of falling back to standalone
 *   ONESHOT_CREDENTIAL_SOURCES    — optional comma list of permitted sources
 *   OPENAI_API_KEY / GROQ_API_KEY / TAVILY_API_KEY — approved built-in provider keys
 *   ONESHOT_PROVIDER_KEY_<NAME>   — approved custom-provider key variables
 *
 * Redis / BullMQ queue variables:
 *   REDIS_URL                     — redis:// or rediss:// endpoint for BullMQ
 *   ONESHOT_QUEUE_READY_TIMEOUT   — ms to wait for Redis at startup (default 8000)
 *   ONESHOT_REDIS_PROBE_TIMEOUT_MS — ms cap for the startup reachability probe (default 2000)
 *   ONESHOT_START_WORKER          — "true" starts a pipeline worker in the server process
 *   ONESHOT_RUN_CONCURRENCY       — worker concurrency (default 1)
 */
