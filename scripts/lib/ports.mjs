/**
 * OneShot Port Utilities
 *
 * Occupancy detection and readiness verification shared by the launchers.
 *
 * Windows lets one process hold the wildcard address (0.0.0.0 / ::) while
 * another binds a specific loopback address on the same port, so a bind probe
 * against 127.0.0.1 reports "free" for a port that is already serving — the
 * stale-port defect. Occupancy is therefore decided by connecting to the
 * loopback addresses (a wildcard listener accepts loopback connections) and by
 * bind-probing the wildcard addresses, so a port is only reported free when
 * nothing can answer on it.
 */

import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

/** Loopback addresses probed with a real connection. */
const LOOPBACK_HOSTS = ["127.0.0.1", "::1"];

/** Wildcard addresses probed with a bind attempt. */
const WILDCARD_HOSTS = ["0.0.0.0", "::"];

/** Error codes meaning the wildcard probe does not apply (e.g. IPv6 disabled). */
const PROBE_NOT_APPLICABLE = new Set(["EAFNOSUPPORT", "EADDRNOTAVAIL", "EPROTONOSUPPORT", "ENOTSUP", "EINVAL"]);

/**
 * Connects to one host:port. A wildcard listener answers loopback connections,
 * so a successful connect proves the port is already serving.
 */
export function isHostAnswering(host, port, timeoutMs = 300) {
  return new Promise((resolveAnswering) => {
    const socket = net.connect({ host, port });
    let settled = false;

    const settle = (answering) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveAnswering(answering);
    };

    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
    socket.setTimeout(timeoutMs, () => settle(false));
  });
}

/** Bind-probes one wildcard address: "occupied", "free" or "unsupported". */
function probeWildcardBind(host, port) {
  return new Promise((resolveProbe) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (PROBE_NOT_APPLICABLE.has(error.code)) return resolveProbe("unsupported");
      return resolveProbe("occupied");
    });
    server.listen(port, host, () => {
      server.close(() => resolveProbe("free"));
    });
  });
}

/**
 * True when the port cannot be handed to a new server: something already
 * answers on a loopback address, or a wildcard address is taken.
 */
export async function isPortOccupied(port, options = {}) {
  const { timeoutMs = 300 } = options;

  for (const host of LOOPBACK_HOSTS) {
    if (await isHostAnswering(host, port, timeoutMs)) return true;
  }

  for (const host of WILDCARD_HOSTS) {
    if ((await probeWildcardBind(host, port)) === "occupied") return true;
  }

  return false;
}

/**
 * First free port at or above startPort.
 * Throws when every candidate in the range is occupied.
 */
export async function findAvailablePort(startPort = 8787, options = {}) {
  const { maxTries = 200 } = options;
  const lastPort = startPort + maxTries - 1;

  for (let candidate = startPort; candidate <= lastPort; candidate++) {
    if (!(await isPortOccupied(candidate, options))) return candidate;
  }

  throw new Error(`No free port found in range ${startPort}-${lastPort}`);
}

/** Canonical OneShot health payload contract (backend/routes/health.ts). */
export function isHealthyPayload(payload) {
  return Boolean(payload) && payload.ok === true && payload.status === "healthy";
}

/**
 * Requests one health endpoint. Returns the HTTP status and the parsed payload
 * so callers report the concrete response instead of a bare boolean.
 */
export async function probeHealth(port, options = {}) {
  const { host = "127.0.0.1", path = "/api/health", timeoutMs = 1000 } = options;

  try {
    const response = await fetch(`http://${host}:${port}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) {
      return { healthy: false, status: response.status, payload: null };
    }
    const payload = await response.json();
    return { healthy: isHealthyPayload(payload), status: response.status, payload };
  } catch {
    return { healthy: false, status: 0, payload: null };
  }
}

/** Polls the health endpoint until the payload contract matches. */
export async function waitForHealthy(port, options = {}) {
  const { attempts = 40, intervalMs = 350 } = options;
  let last = { healthy: false, status: 0, payload: null };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    last = await probeHealth(port, options);
    if (last.healthy) return { ...last, attemptsUsed: attempt };
    if (attempt < attempts) await sleep(intervalMs);
  }

  return { ...last, attemptsUsed: attempts };
}

/**
 * Extracts the bound port from the backend's startup line, e.g.
 * "[OneShot] Listening on http://0.0.0.0:8789".
 */
export function extractListeningPort(text) {
  if (typeof text !== "string") return null;
  const match = text.match(/Listening on https?:\/\/(?:\[[^\]]+\]|[^:\s/]+):(\d+)/);
  return match ? Number(match[1]) : null;
}
