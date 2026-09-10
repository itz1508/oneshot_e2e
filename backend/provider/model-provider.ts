export interface ModelGenerateRequest {
  system?: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface ModelProviderReadiness {
  ready: boolean;
  provider: string;
  models: string[];
  detail?: string;
}

/**
 * Provider boundary: model transport only.
 *
 * This contract intentionally has no Prompt, ResearchBundle, Researcher,
 * fixture, goal, schema, or workflow types. Those belong to backend roles.
 */
export interface ModelProvider {
  readonly id: string;
  readonly model: string;
  generate(input: ModelGenerateRequest): Promise<string>;
  ready(runId: string): Promise<ModelProviderReadiness>;
  close?(): void;
}

export interface ModelProviderConfig {
  apiKey: string;
  model: string;
  apiBase?: string;
  timeoutSeconds: number;
  maxOutputTokens: number;
  temperature?: number;
}
