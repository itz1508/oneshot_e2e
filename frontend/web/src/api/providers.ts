import { httpFetch } from "./client";

export async function getProviders(): Promise<import("./types/providers").ProviderConfig[]> {
  return httpFetch<import("./types/providers").ProviderConfig[]>("/api/providers");
}

export async function getProvider(id: string): Promise<import("./types/providers").ProviderConfig> {
  return httpFetch<import("./types/providers").ProviderConfig>(`/api/providers/${id}`);
}

export async function configureProvider(
  id: string,
  body: import("./types/providers").ProviderConfigurationRequest,
): Promise<import("./types/providers").ProviderConfigurationResponse> {
  return httpFetch<import("./types/providers").ProviderConfigurationResponse>(
    `/api/providers/${id}/config`,
    { method: "POST", body },
  );
}

export async function testProviderConnection(
  id: string,
): Promise<import("./types/providers").ProviderConnectionTestResponse> {
  return httpFetch<import("./types/providers").ProviderConnectionTestResponse>(
    `/api/providers/${id}/test`,
    { method: "POST" },
  );
}

export async function discoverProviderModels(
  id: string,
): Promise<import("./types/models").ModelDescriptor[]> {
  return httpFetch<import("./types/models").ModelDescriptor[]>(
    `/api/providers/${id}/models`,
    { method: "POST" },
  );
}

export async function getModels(): Promise<import("./types/models").ModelRegistrySnapshot> {
  return httpFetch<import("./types/models").ModelRegistrySnapshot>("/api/models");
}
