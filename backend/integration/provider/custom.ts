import type {
  AuthMethod,
  EndpointDefinition,
  ModelTransport,
  ProviderDefinition,
} from "../core/types.js";
import type { CredentialReference } from "../../security/credential-reference.js";

export interface CustomProviderInput {
  providerId: string;
  displayName?: string;
  transport: ModelTransport;
  authMethod: AuthMethod;
  requiresAuth: boolean;
  allowedHeaders?: readonly string[];
}

/**
 * Build a custom (`kind: "custom"`) provider definition. Full header
 * allowlisting and dangerous-header rejection is applied in M11; M2 only
 * constructs the descriptor so registries can accept custom entries.
 */
export function createCustomProvider(
  input: CustomProviderInput,
): ProviderDefinition {
  const id = input.providerId.trim();
  if (!id) {
    throw new Error("custom provider requires a non-empty providerId");
  }
  return {
    providerId: id,
    displayName: (input.displayName ?? "").trim() || id,
    kind: "custom",
    transport: input.transport,
    authMethod: input.authMethod,
    requiresAuth: input.requiresAuth,
    allowedHeaders: input.allowedHeaders ?? [],
  };
}

export interface OpenAICompatibleCustomProviderInput {
  readonly providerId: string;
  readonly displayName?: string;
  readonly baseUrl: string;
  readonly requiresAuth?: boolean;
  /**
   * @deprecated Legacy bridge (correction #8). Used ONLY to decide `requiresAuth`
   * and then discarded. NOT stored on the definition, NOT accepted from HTTP
   * input, disabled in production. The M11 path is `credentialRef`.
   */
  readonly apiKey?: string;
  /**
   * Non-secret credential reference (M11). Stored on the bundle metadata; the
   * secret is resolved only at invocation via CredentialResolver.
   */
  readonly credentialRef?: CredentialReference;
  readonly allowedHeaders?: readonly string[];
}

export interface CustomProviderBundle {
  readonly provider: ProviderDefinition;
  readonly endpoint: EndpointDefinition;
  /** Non-secret credential reference (M11); never a secret value. */
  readonly credentialRef?: CredentialReference;
}

/**
 * Build a custom OpenAI-compatible provider (transport `openai-chat`) and its
 * endpoint carrying the base URL. Locality is left `unknown` here; the M8
 * locality detector refines it. The endpoint id is derived from the provider
 * id, so the same provider has a stable endpoint identity.
 */
export function createOpenAICompatibleCustomProvider(
  input: OpenAICompatibleCustomProviderInput,
): CustomProviderBundle {
  const requiresAuth = input.requiresAuth ?? Boolean(input.apiKey);
  const provider = createCustomProvider({
    providerId: input.providerId,
    displayName: input.displayName,
    transport: "openai-chat",
    authMethod: requiresAuth ? "api-key" : "none",
    requiresAuth,
    allowedHeaders: input.allowedHeaders,
  });
  const endpoint: EndpointDefinition = {
    endpointId: `ep:${provider.providerId}`,
    providerId: provider.providerId,
    baseUrl: input.baseUrl,
    authMethod: provider.authMethod,
    locality: "unknown",
    origin: "user",
    allowedHeaders: input.allowedHeaders ?? [],
  };
  return { provider, endpoint, credentialRef: input.credentialRef };
}

