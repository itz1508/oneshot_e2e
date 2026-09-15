/**
 * Credential policy (M11, corrections #2, #3, #9). Decides which credential
 * sources are permitted given the deployment posture (bind host, production,
 * local-session flag) and authentication presence.
 *
 * Loopback is NOT authentication. Session credentials require loopback AND
 * ONESHOT_LOCAL_CREDENTIAL_SESSION=true AND non-production.
 *
 * Public unauthenticated mode hard-disables credential submission, session
 * storage, secret-reference creation, and credential mutation. Credential
 * management fails closed; a soft general warning is the caller's concern.
 */
import type { AuthenticationContextProvider } from "./authentication-context.js";
import type { DeploymentPosture } from "./deployment-posture.js";
import {
  assertSameProvider,
  CredentialError,
  type CredentialReference,
  type CredentialSource,
} from "./credential-reference.js";

export interface CredentialPolicy {
  allowedSources(): readonly CredentialSource[];
  isPublicUnauthed(): boolean;
  /** Loopback AND ONESHOT_LOCAL_CREDENTIAL_SESSION=true AND non-production. */
  canStoreSessionCredential(): boolean;
  /** Authenticated principal OR loopback with the local-session flag (non-production). */
  canAcceptSecretStoreReference(): boolean;
  /** Fail-closed: reject a credential source not permitted by the posture. */
  assertStorageAllowed(source: CredentialSource): void;
  /** Fail-closed: reject credential mutation in public-unauthed mode. */
  assertMutationAllowed(): void;
  /** A reference for one provider must not satisfy another (correction #9). */
  assertCrossProvider(ref: CredentialReference, targetProviderId: string): void;
}

export function createCredentialPolicy(
  posture: DeploymentPosture,
  auth: AuthenticationContextProvider,
): CredentialPolicy {
  const isPublicUnauthed = posture.isPublicUnauthed;
  const sessionOk =
    posture.isLoopback &&
    posture.localCredentialSessionEnabled &&
    !posture.isProduction;
  const secretStoreOk =
    auth.principal().authenticated || sessionOk;

  function allowedSources(): CredentialSource[] {
    // Public unauthed: environment + none only (correction #3).
    if (isPublicUnauthed) return ["environment", "none"];
    const s: CredentialSource[] = ["environment", "none"];
    if (sessionOk) s.push("session");
    if (secretStoreOk) s.push("secret-store");
    return s;
  }

  return {
    allowedSources,
    isPublicUnauthed: () => isPublicUnauthed,
    canStoreSessionCredential: () => sessionOk,
    canAcceptSecretStoreReference: () => secretStoreOk,
    assertStorageAllowed: (source) => {
      if (!allowedSources().includes(source)) {
        throw new CredentialError(
          "CREDENTIAL_DENIED",
          `credential source '${source}' is not permitted in this deployment posture`,
        );
      }
    },
    assertMutationAllowed: () => {
      if (isPublicUnauthed) {
        throw new CredentialError(
          "CREDENTIAL_DENIED",
          "credential mutation is disabled in public unauthenticated mode",
        );
      }
    },
    assertCrossProvider: (ref, targetProviderId) => {
      assertSameProvider(ref, targetProviderId);
    },
  };
}
