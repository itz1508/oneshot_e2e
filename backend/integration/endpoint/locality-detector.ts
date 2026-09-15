import type { EndpointLocality } from "../core/types.js";

/**
 * Locality detector (M8). Classifies an endpoint URL into an `EndpointLocality`
 * purely from the URL host (no DNS). IP literals are classified by range;
 * `localhost` → loopback, `host.docker.internal` → container-host; other
 * hostnames → `unknown` (true locality requires DNS, a separate M8 check).
 */
export interface LocalityDetector {
  detect(url: string): EndpointLocality;
}

export function createLocalityDetector(): LocalityDetector {
  return {
    detect: (url) => {
      let host: string;
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        return "unknown";
      }
      return classifyHost(host);
    },
  };
}

export function classifyHost(host: string): EndpointLocality {
  const h = host.replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "::1" || h.startsWith("127.")) {
    return "loopback";
  }
  if (
    h === "host.docker.internal" ||
    h === "host.k3d.internal" ||
    h === "gateway.internal"
  ) {
    return "container-host";
  }
  const ip = parseIpv4(h);
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
