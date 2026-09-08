export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export function authHeaders(): Headers {
  const headers = new Headers();
  const token = sessionStorage.getItem('oneshot.accessToken');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}
export async function request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', signal?: AbortSignal): Promise<T> {
  const headers = authHeaders();
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { method, headers, credentials: 'same-origin', cache: 'no-store', signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const contentType = response.headers.get('content-type') || '';
  let data: any;
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = {};
    }
  } else {
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new ApiError(`Service unavailable (${response.status})`, response.status);
    }
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new ApiError(`Endpoint returned unexpected HTML response (${response.status})`, response.status);
    }
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message = (data && typeof data === 'object' && (data.error || data.root_cause?.issue || data.message)) || `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}
export async function optional<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  try { return await request<T>(path, undefined, 'GET', signal); }
  catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
}
// Reconnects the existing SSE endpoint, never polls run state. An abort closes
// both the reader and retry wait when switching conversations or unmounting.
export async function streamEvents(path: string, signal: AbortSignal, onEvent: (event?: EventRecord) => void, onStatus: (value: string) => void) {
  let lastId = '', delay = 900;
  while (!signal.aborted) {
    try {
      const headers = authHeaders(); headers.set('Accept', 'text/event-stream');
      if (lastId) headers.set('Last-Event-ID', lastId);
      const response = await fetch(path, { headers, credentials: 'same-origin', signal });
      if (!response.ok || !response.body) throw new ApiError('Event stream unavailable', response.status);
      onStatus('Connected'); onEvent(); delay = 900;
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      try {
        while (!signal.aborted) {
          const chunk = await reader.read(); if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          buffer = buffer.replace(/\r\n/g, '\n');
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            const lines = block.split('\n');
            const id = lines.find(line => line.startsWith('id:'))?.slice(3).trim();
            if (id) lastId = id;
            const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
            if (data) onEvent(JSON.parse(data) as EventRecord);
          }
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) { onStatus('Authentication required'); return; }
    }
    if (signal.aborted) return;
    onStatus('Reconnecting');
    await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, delay); signal.addEventListener('abort', done, { once: true });
    });
    delay = Math.min(delay * 2, 5000);
  }
}
import type { EventRecord } from './contracts';
