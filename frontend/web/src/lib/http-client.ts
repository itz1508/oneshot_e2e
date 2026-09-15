export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
    ) {
        super(message);
    }
}
export async function request<T>(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    signal?: AbortSignal,
): Promise<T> {
    const headers = new Headers();
    headers.set("Accept", "application/json");
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(path, {
        method,
        headers,
        credentials: "same-origin",
        cache: "no-store",
        signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const contentType = response.headers.get("content-type") || "";
    let data: any;
    if (contentType.includes("application/json")) {
        try {
            data = await response.json();
        } catch {
            data = {};
        }
    } else {
        const text = await response.text().catch(() => "");
        if (!response.ok) {
            throw new ApiError(
                `Service unavailable (${response.status})`,
                response.status,
            );
        }
        if (
            text.trim().startsWith("<!DOCTYPE") ||
            text.trim().startsWith("<html")
        ) {
            throw new ApiError(
                `Endpoint returned unexpected HTML response (${response.status})`,
                response.status,
            );
        }
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }
    if (!response.ok) {
        const message =
            (data &&
                typeof data === "object" &&
                (data.error || data.root_cause?.issue || data.message)) ||
            `Request failed (${response.status})`;
        throw new ApiError(message, response.status);
    }
    return data as T;
}
export async function optional<T>(
    path: string,
    signal?: AbortSignal,
): Promise<T | null> {
    try {
        return await request<T>(path, undefined, "GET", signal);
    } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
    }
}
