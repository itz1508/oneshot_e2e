import type http from "node:http";

export function sendJson(
  res: http.ServerResponse,
  status: number,
  payload: unknown
): true {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
  return true;
}

export function sendError(
  res: http.ServerResponse,
  status: number,
  error: string,
  extra?: Record<string, unknown>
): true {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error, ...extra }));
  return true;
}
