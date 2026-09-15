/**
 * Port policy (M8). Restricts which ports a probe may target to reduce
 * arbitrary-port scanning. Allows well-known web ports (80, 443) and all
 * non-privileged ports (>= 1024) — where local dev model servers and the mock
 * ephemeral ports live — and denies privileged non-web ports (e.g. 22, 25).
 * Pure.
 */
export interface PortPolicy {
  isAllowed(port: number): boolean;
}

export function createPortPolicy(): PortPolicy {
  return {
    isAllowed: (port) =>
      Number.isInteger(port) && port > 0 && (port === 80 || port === 443 || port >= 1024),
  };
}
