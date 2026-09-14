import type { ProviderSettings } from "../types";

const STORAGE_KEY = "oneshot:researcher:settings:v1";

export const DEFAULT_SETTINGS: ProviderSettings = {
  runtimeMode: "browser",
  researchStyle: "balanced",
};

export function loadSettings(): ProviderSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ProviderSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ProviderSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function hasProviderSettings(settings: ProviderSettings): boolean {
  return Boolean(settings.provider && settings.apiKey);
}

export function hasTavilyKey(settings: ProviderSettings): boolean {
  return Boolean(settings.tavilyApiKey);
}
