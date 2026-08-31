import { randomUUID } from "node:crypto";
export function newRunId(): string { return randomUUID(); }
export function id(prefix: string, runId: string): string { return `${prefix}:${runId}`; }
