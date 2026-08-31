export function clone<T>(value: T): T { return structuredClone(value); }
export function unique<T>(items: T[]): T[] { return [...new Set(items)]; }
