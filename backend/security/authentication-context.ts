/**
 * Authentication context provider (M11, correction #1).
 *
 * An EXPLICIT abstraction — NOT a fake middleware stub that could be mistaken
 * for an authentication boundary. The current implementation,
 * UnauthenticatedContextProvider, is named so it cannot be mistaken for
 * enforcement. M13 layers a real provider here without reshaping the credential
 * policy.
 */

export interface AuthenticationPrincipal {
  readonly authenticated: boolean;
  readonly principalId?: string;
}

export interface AuthenticationContextProvider {
  /** Return the authenticated principal for the current execution context. */
  principal(): AuthenticationPrincipal;
}

/**
 * The current OneShot posture: no user authentication exists (auth was removed
 * in commits 1128e427 / 81155646). This provider returns an unauthenticated
 * principal BY DESIGN. It is NOT an enforcement boundary and must not be treated
 * as one.
 */
export class UnauthenticatedContextProvider
  implements AuthenticationContextProvider
{
  principal(): AuthenticationPrincipal {
    return { authenticated: false };
  }
}
