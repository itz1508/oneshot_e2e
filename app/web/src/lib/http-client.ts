export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body,
      `HTTP ${res.status}: ${JSON.stringify(body)}`,
    );
  }
  return body as T;
}

export async function optional<T>(
  path: string,
  options?: RequestInit,
): Promise<T | undefined> {
  try {
    return await request<T>(path, options);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined;
    throw e;
  }
}
