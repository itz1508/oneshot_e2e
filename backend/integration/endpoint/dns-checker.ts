import { lookup as dnsLookup } from "node:dns/promises";
import { isMetadataAddress } from "./metadata-blocklist.js";

/**
 * DNS checker (M8). Resolves a hostname (via an injectable resolver) and
 * rejects if any resolved address is a metadata IP (DNS rebinding to
 * 169.254.169.254). IP literals are not resolved (no DNS) but are still
 * checked against the metadata blocklist. The resolver is injectable so tests
 * stay offline.
 */
export interface DnsCheckResult {
  readonly addresses: readonly string[];
  readonly blocked: boolean;
  readonly blockedAddress?: string;
  readonly dnsResolved: boolean;
}

export type DnsResolver = (host: string) => Promise<readonly string[]>;

export async function checkDns(
  host: string,
  resolve: DnsResolver = defaultResolve,
): Promise<DnsCheckResult> {
  if (isIpLiteral(host)) {
    return {
      addresses: [host],
      blocked: isMetadataAddress(host),
      blockedAddress: isMetadataAddress(host) ? host : undefined,
      dnsResolved: false,
    };
  }
  const addresses = await resolve(host);
  for (const a of addresses) {
    if (isMetadataAddress(a)) {
      return { addresses, blocked: true, blockedAddress: a, dnsResolved: true };
    }
  }
  return { addresses, blocked: false, dnsResolved: true };
}

function isIpLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h === "::1" || h.includes(":");
}

async function defaultResolve(host: string): Promise<readonly string[]> {
  const r = await dnsLookup(host, { all: true });
  return r.map((a) => a.address);
}
