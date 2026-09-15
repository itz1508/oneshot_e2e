/**
 * Deployment posture (M11). Detects bind host, production mode, the local
 * credential-session flag, and authentication presence.
 *
 * Loopback is NOT authentication (correction #2). Session credentials
 * additionally require ONESHOT_LOCAL_CREDENTIAL_SESSION=true AND non-production
 * mode (and origin protections when an HTTP route is added later).
 *
 * Public unauthenticated mode (correction #3) hard-disables credential
 * submission, session storage, secret-reference creation, and credential
 * mutation. A soft startup warning is acceptable for general API operation,
 * but credential management fails closed.
 */

export interface DeploymentPosture {
  readonly bindHost: string;
  readonly isLoopback: boolean;
  readonly isProduction: boolean;
  readonly localCredentialSessionEnabled: boolean;
  readonly authPresent: boolean;
  /** True when there is no authentication AND the bind host is not loopback. */
  readonly isPublicUnauthed: boolean;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

function parseBool(value: string | undefined): boolean {
  return String(value || "").toLowerCase() === "true";
}

export function detectDeploymentPosture(
  env: NodeJS.ProcessEnv = process.env,
): DeploymentPosture {
  const bindHost = (env.ONESHOT_BIND_HOST || "0.0.0.0").trim();
  const isLoopback = LOOPBACK_HOSTS.has(bindHost);
  const mode = String(env.ONESHOT_MODE || env.NODE_ENV || "").toLowerCase();
  const isProduction = mode === "production";
  const localCredentialSessionEnabled = parseBool(
    env.ONESHOT_LOCAL_CREDENTIAL_SESSION,
  );
  const authPresent = parseBool(env.ONESHOT_REQUIRE_AUTH);
  const isPublicUnauthed = !authPresent && !isLoopback;
  return {
    bindHost,
    isLoopback,
    isProduction,
    localCredentialSessionEnabled,
    authPresent,
    isPublicUnauthed,
  };
}
