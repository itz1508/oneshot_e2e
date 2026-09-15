import type { EndpointLocality } from "../core/types.js";

/**
 * URL validator (M8). Restricts protocols to http/https and requires a host.
 * Port allowlisting is delegated to the port policy; metadata blocking to the
 * metadata blocklist. Pure (no network).
 */
export interface UrlValidationResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly protocol: string;
  readonly host: string;
  readonly port: number;
}

export interface UrlValidator {
  validate(url: string): UrlValidationResult;
}

export function createUrlValidator(
  allowedProtocols: readonly string[] = ["http:", "https:"],
): UrlValidator {
  return {
    validate: (url) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return {
          ok: false,
          reason: "invalid URL",
          protocol: "",
          host: "",
          port: 0,
        };
      }
      if (!allowedProtocols.includes(parsed.protocol)) {
        return {
          ok: false,
          reason: `protocol not allowed: ${parsed.protocol}`,
          protocol: parsed.protocol,
          host: parsed.hostname,
          port: portOf(parsed),
        };
      }
      if (!parsed.hostname) {
        return {
          ok: false,
          reason: "missing host",
          protocol: parsed.protocol,
          host: "",
          port: 0,
        };
      }
      return {
        ok: true,
        protocol: parsed.protocol,
        host: parsed.hostname,
        port: portOf(parsed),
      };
    },
  };
}

function portOf(u: URL): number {
  if (u.port) return Number(u.port);
  return u.protocol === "https:" ? 443 : 80;
}

/** Endpoint locality hint derived purely from the URL (no DNS). */
export function urlLocality(url: string): EndpointLocality {
  try {
    return localityFromHost(new URL(url).hostname.toLowerCase());
  } catch {
    return "unknown";
  }
}

function localityFromHost(host: string): EndpointLocality {
  if (
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]" ||
    host.startsWith("127.")
  ) {
    return "loopback";
  }
  if (
    host === "host.docker.internal" ||
    host === "host.k3d.internal" ||
    host === "gateway.internal"
  ) {
    return "container-host";
  }
  const ip = parseIpv4(host);
  if (ip) {
    if (ip[0] === 127) return "loopback";
    if (ip[0] === 10) return "private-network";
    if (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) return "private-network";
    if (ip[0] === 192 && ip[1] === 168) return "private-network";
    return "cloud";
  }
  return "unknown";
}

function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return [nums[0], nums[1], nums[2], nums[3]];
}
