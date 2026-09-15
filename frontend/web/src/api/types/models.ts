export interface ModelDescriptor {
  id: string;
  displayName: string;
  providerId: string;
  capabilities: string[];
}

export interface ModelRegistrySnapshot {
  models: ModelDescriptor[];
  providerCount: number;
}
