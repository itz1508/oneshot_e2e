/**
 * OneShot Configuration Module
 * Loads config.toml, parses, interpolates env variables, and validates via Zod schema.
 */

import fs from "node:fs";
import path from "node:path";
import { parseToml } from "./toml-parser.js";
import { OneShotConfigSchema, type OneShotConfig } from "./schema.js";

export * from "./schema.js";
export * from "./toml-parser.js";

let cachedConfig: OneShotConfig | null = null;

export function loadConfig(customPath?: string): OneShotConfig {
  const defaultLocations = [
    customPath,
    process.env.ONESHOT_CONFIG_PATH,
    path.resolve(process.cwd(), "config.toml"),
    path.resolve(process.cwd(), "../config.toml"),
  ].filter((p): p is string => Boolean(p));

  let tomlContent = "";
  let resolvedPath = "";

  for (const loc of defaultLocations) {
    if (fs.existsSync(loc)) {
      try {
        tomlContent = fs.readFileSync(loc, "utf-8");
        resolvedPath = loc;
        break;
      } catch {
        // Continue searching fallback paths
      }
    }
  }

  let parsedRaw: Record<string, unknown> = {};
  if (tomlContent) {
    try {
      parsedRaw = parseToml(tomlContent);
    } catch (err) {
      console.warn(`[OneShotConfig] Failed to parse TOML at ${resolvedPath}, falling back to defaults:`, err);
    }
  }

  const result = OneShotConfigSchema.safeParse(parsedRaw);
  if (!result.success) {
    console.warn("[OneShotConfig] Configuration validation warnings:", result.error.format());
    // Parse empty object to yield complete safe defaults
    cachedConfig = OneShotConfigSchema.parse({});
  } else {
    cachedConfig = result.data;
  }

  return cachedConfig;
}

export function getConfig(): OneShotConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}
