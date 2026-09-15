// Retired: this script used to copy the old vanilla-js console from src/ to
// dist/. The Next.js app builds via `next build` + scripts/export.mjs.
// Kept as a guard so stale tooling fails loudly instead of publishing a
// dist/ directory that does not match the Next.js output.
throw new Error(
    "build.mjs is retired for the Next.js app; run `npm run build` (next build + scripts/export.mjs) instead.",
);
