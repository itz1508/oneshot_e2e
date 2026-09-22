/**
 * createResearcherRuntime — the single entrypoint the UI uses.
 *
 * Explicit mode selection: caller decides SIMULATION vs LIVE_API.
 * NO silent fallback: LIVE_API without an apiBaseUrl throws
 * LiveApiNotConfiguredError; the caller must render an explicit
 * "LIVE_API not configured" error and let the user choose.
 */

import type { ExecutionMode, FetchLike, ResearcherRuntime } from "./types";
import { LiveApiNotConfiguredError } from "./types";
import { SimulationRuntime } from "./SimulationRuntime";
import { LiveApiRuntime } from "./LiveApiRuntime";

export interface CreateResearcherRuntimeOptions {
  readonly executionMode: ExecutionMode;
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly abortController?: AbortController;
}

export function createResearcherRuntime(
  opts: CreateResearcherRuntimeOptions,
): ResearcherRuntime {
  if (opts.executionMode === "SIMULATION") {
    return new SimulationRuntime();
  }
  if (opts.executionMode === "LIVE_API") {
    if (!opts.apiBaseUrl || !opts.fetchImpl) {
      throw new LiveApiNotConfiguredError();
    }
    return new LiveApiRuntime({
      apiBaseUrl: opts.apiBaseUrl,
      fetchImpl: opts.fetchImpl,
      abortController: opts.abortController,
    });
  }
  throw new Error(`Unknown executionMode: ${String(opts.executionMode)}`);
}
