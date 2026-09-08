// Stable public entry point for authenticated HTTP and event-stream clients.
export { ApiError, authHeaders, request, optional } from "./http-client";
export { streamEvents } from "./event-stream";
