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
 *   ONESHOT_CREDENTIAL_SOURCES    — optional comma list of permitted sources
 *   OPENAI_API_KEY / GROQ_API_KEY / TAVILY_API_KEY — approved built-in provider keys
 *   ONESHOT_PROVIDER_KEY_<NAME>   — approved custom-provider key variables
 */
