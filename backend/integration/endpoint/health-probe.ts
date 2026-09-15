import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { EndpointHealth } from "../core/types.js";
import { createUrlValidator, type UrlValidator } from "./url-validator.js";
import { createPortPolicy, type PortPolicy } from "./port-policy.js";
import { isMetadataHost } from "./metadata-blocklist.js";
import { createLocalityDetector, type LocalityDetector } from "./locality-detector.js";
import { checkDns, type DnsResolver } from "./dns-checker.js";
import { validateRedirect } from "./redirect-validator.js";

export interface ProbeInput {
  readonly endpointId: string;
  readonly url: string;
  readonly timeoutMs?: number;
  readonly maxRedirects?: number;
}

export interface HttpGetResult {
  readonly reachable: boolean;
  readonly status: number;
  readonly latencyMs: number;
  readonly redirectLocation?: string;
  readonly error?: string;
}

export type HttpGet = (
  url: string,
  opts: { timeoutMs?: number },
) => Promise<HttpGetResult>;

export interface EndpointHealthProbe {
  probe(input: ProbeInput): Promise<EndpointHealth>;
}

export interface HealthProbeDeps {
  readonly urlValidator?: UrlValidator;
  readonly portPolicy?: PortPolicy;
  readonly localityDetector?: LocalityDetector;
  readonly httpGet?: HttpGet;
  readonly dnsResolve?: DnsResolver;
  readonly maxRedirects?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_REDIRECTS = 3;

export function createEndpointHealthProbe(
  deps: HealthProbeDeps = {},
): EndpointHealthProbe {
  const urlValidator = deps.urlValidator ?? createUrlValidator();
  const portPolicy = deps.portPolicy ?? createPortPolicy();
  const localityDetector = deps.localityDetector ?? createLocalityDetector();
  const httpGet = deps.httpGet ?? defaultHttpGet;
  const maxRedirects = deps.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  void localityDetector; // locality is available to the caller via createLocalityDetector
  return {
    probe: async (input) => {
      const lastProbedAt = new Date().toISOString();
      const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const fail = (probeError: string, extra: Partial<EndpointHealth> = {}): EndpointHealth => ({
        endpointId: input.endpointId,
        reachable: false,
        lastProbedAt,
        probeError,
        ...extra,
      });

      const u = urlValidator.validate(input.url);
      if (!u.ok) return fail(`invalid url: ${u.reason}`);
      if (!portPolicy.isAllowed(u.port)) return fail(`port not allowed: ${u.port}`);
      if (isMetadataHost(u.host)) return fail(`metadata host blocked: ${u.host}`);

      const dns = await checkDns(u.host, deps.dnsResolve).catch((e) => ({
        addresses: [] as readonly string[],
        blocked: false,
        blockedAddress: undefined,
        dnsResolved: false,
        error: e as Error,
      }));
      if ("error" in dns && dns.error) {
        return fail(`dns resolution failed: ${String(dns.error)}`);
      }
      if (dns.blocked) {
        return fail(`dns resolved to metadata ip: ${dns.blockedAddress}`, {
          dnsResolved: dns.dnsResolved,
        });
      }

      const redirectChain: string[] = [];
      let currentUrl = input.url;
      let redirects = 0;
      let reachable = false;
      let latencyMs: number | undefined;
      let probeError: string | undefined;

      for (;;) {
        const result = await withTimeout(() => httpGet(currentUrl, { timeoutMs }), timeoutMs);
        reachable = result.reachable;
        latencyMs = result.latencyMs;
        if (!result.reachable) {
          probeError = result.error ?? "unreachable";
          break;
        }
        const loc = result.redirectLocation;
        if (loc && result.status >= 300 && result.status < 400) {
          if (redirects >= maxRedirects) {
            probeError = `too many redirects (>${maxRedirects})`;
            reachable = false;
            break;
          }
          const target = new URL(loc, currentUrl).toString();
          const rv = validateRedirect(target, { url: urlValidator, port: portPolicy });
          if (!rv.ok) {
            probeError = `redirect blocked: ${rv.reason}`;
            reachable = false;
            break;
          }
          redirectChain.push(target);
          currentUrl = target;
          redirects += 1;
          continue;
        }
        break;
      }

      return {
        endpointId: input.endpointId,
        reachable,
        latencyMs,
        lastProbedAt,
        probeError,
        redirectChain: redirectChain.length ? redirectChain : undefined,
        dnsResolved: dns.dnsResolved,
      };
    },
  };
}


function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("probe timeout")), timeoutMs);
    fn()
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  }).catch(
    () =>
      ({
        reachable: false,
        status: 0,
        latencyMs: timeoutMs,
        error: "probe timeout",
      }) as unknown as T,
  ) as unknown as Promise<T>;
}

/** Default GET via Node http/https (undici-free). Drains the body, captures Location. */
function defaultHttpGet(
  url: string,
  opts: { timeoutMs?: number },
): Promise<HttpGetResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const lib = url.startsWith("https:") ? httpsRequest : httpRequest;
    const req = lib(url, { method: "GET", agent: false }, (res) => {
      res.resume();
      const latencyMs = Date.now() - start;
      const status = res.statusCode ?? 0;
      const loc = res.headers.location;
      resolve({
        reachable: true,
        status,
        latencyMs,
        redirectLocation:
          status >= 300 && status < 400 && typeof loc === "string"
            ? loc
            : undefined,
      });
    });
    req.on("error", (e) =>
      resolve({
        reachable: false,
        status: 0,
        latencyMs: Date.now() - start,
        error: e.message,
      }),
    );
    if (opts.timeoutMs) {
      req.setTimeout(opts.timeoutMs, () => req.destroy(new Error("probe timeout")));
    }
    req.end();
  });
}
