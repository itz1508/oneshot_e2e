import { ApiError } from "./http-client";
// Reconnects the existing SSE endpoint, never polls run state. An abort closes
// both the reader and retry wait when switching conversations or unmounting.
export async function streamEvents(
    path: string,
    signal: AbortSignal,
    onEvent: (event?: EventRecord) => void,
    onStatus: (value: string) => void,
) {
    let lastId = "",
        delay = 900;
    while (!signal.aborted) {
        try {
            const headers = new Headers();
            headers.set("Accept", "text/event-stream");
            if (lastId) headers.set("Last-Event-ID", lastId);
            const response = await fetch(path, {
                headers,
                credentials: "same-origin",
                signal,
            });
            if (!response.ok || !response.body)
                throw new ApiError("Event stream unavailable", response.status);
            onStatus("Connected");
            onEvent();
            delay = 900;
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            try {
                while (!signal.aborted) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    buffer += decoder.decode(chunk.value, { stream: true });
                    buffer = buffer.replace(/\r\n/g, "\n");
                    let boundary;
                    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
                        const block = buffer.slice(0, boundary);
                        buffer = buffer.slice(boundary + 2);
                        const lines = block.split("\n");
                        const id = lines
                            .find((line) => line.startsWith("id:"))
                            ?.slice(3)
                            .trim();
                        if (id) lastId = id;
                        const data = lines
                            .filter((line) => line.startsWith("data:"))
                            .map((line) => line.slice(5).trimStart())
                            .join("\n");
                        if (data) onEvent(JSON.parse(data) as EventRecord);
                    }
                }
            } finally {
                await reader.cancel().catch(() => {});
                reader.releaseLock();
            }
        } catch (error) {
            if (signal.aborted) return;
        }
        if (signal.aborted) return;
        onStatus("Reconnecting");
        await new Promise<void>((resolve) => {
            const done = () => {
                clearTimeout(timer);
                signal.removeEventListener("abort", done);
                resolve();
            };
            const timer = setTimeout(done, delay);
            signal.addEventListener("abort", done, { once: true });
        });
        delay = Math.min(delay * 2, 5000);
    }
}
import type { EventRecord } from "./contracts";
