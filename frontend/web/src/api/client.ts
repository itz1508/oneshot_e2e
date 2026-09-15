export async function httpFetch<T>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const url = new URL(path, process.env.ONESHOT_BACKEND_TARGET || "http://127.0.0.1:8787");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const body = options?.body !== undefined ? JSON.stringify(options.body) : undefined;
  const res = await fetch(url.toString(), {
    method: options?.method || "GET",
    headers,
    body,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json() as T;
}
