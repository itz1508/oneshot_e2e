import type { ProviderSettings, ResearchStyle } from "../types";

export function providerGateReason(settings: ProviderSettings): string | undefined {
  if (settings.runtimeMode === "python" && !settings.remoteBaseUrl) {
    return "Python backend URL is not configured.";
  }
  if (!settings.provider) return "No provider selected.";
  if (!settings.apiKey) return "Provider API key is missing.";
  return undefined;
}

export function researchStyleLabel(style: ResearchStyle): string {
  switch (style) {
    case "fast":
      return "Fast";
    case "deep":
      return "Deep research";
    default:
      return "Balanced";
  }
}
