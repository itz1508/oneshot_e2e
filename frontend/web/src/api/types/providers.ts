export interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  kind: string;
  version: string;
  config: Record<string, unknown>;
  status: "configured" | "partial" | "missing";
}

export interface ProviderConfigurationRequest {
  provider: string;
  config: Record<string, unknown>;
}

export interface ProviderConfigurationResponse {
  ok: boolean;
  id: string;
  name: string;
  status: string;
  compute?: string;
  error?: string;
}

export interface ProviderConnectionTestRequest {
  provider: string;
}

export interface ProviderConnectionTestResponse {
  ok: boolean;
  provider: string;
  providerKind?: string;
  version?: string;
  compute?: string;
  error?: string;
}
