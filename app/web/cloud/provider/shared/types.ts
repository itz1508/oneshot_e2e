/** Provider workers emit node-level lifecycle events over the stdio bridge. */
export interface ProviderWorkerEvent {
  node: string;
  state: "Running" | "Completed";
  message?: string;
}

export interface WorkerConfig {
  timeoutSeconds: number;
}

export interface WorkerPoolConfig extends WorkerConfig {
  workerPoolSize: number;
}
