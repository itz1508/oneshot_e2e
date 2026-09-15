// Ambient declarations for Next.js 16 runtime-only modules.
// Next ships these paths as JavaScript without bundled TypeScript
// declarations, so the generated .next/types files and app code need
// minimal shapes here. Keep these structural; do not import app code.

declare module "next" {
  export interface Metadata {
    title?: string;
    description?: string;
    icons?: unknown;
  }
  export interface ResolvingMetadata {
    [key: string]: unknown;
  }
  export interface ResolvingViewport {
    [key: string]: unknown;
  }
}

declare module "next/types.js" {
  export interface ResolvingMetadata {
    [key: string]: unknown;
  }
  export interface ResolvingViewport {
    [key: string]: unknown;
  }
}

declare module "next/dist/lib/metadata/types/metadata-interface.js" {
  export interface ResolvingMetadata {
    [key: string]: unknown;
  }
  export interface ResolvingViewport {
    [key: string]: unknown;
  }
}

declare module "next/dist/build/segment-config/app/app-segment-config.js" {
  export type InstantConfigForTypeCheckInternal = Record<string, unknown>;
  export type Prefetch = boolean | undefined;
}
