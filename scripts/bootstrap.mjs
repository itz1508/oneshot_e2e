#!/usr/bin/env node
/**
 * OneShot Bootstrap - Wrapper
 *
 * This is a compatibility wrapper that delegates to the modular bootstrap.
 * DO NOT add installation logic here - use scripts/bootstrap/index.mjs instead.
 */

import { bootstrap } from "./bootstrap/index.mjs";

// Execute bootstrap with default options
bootstrap({
  preflight: true,
  install: true,
  build: true,
  verify: false,
  offline: false,
}).catch((err) => {
  console.error("Bootstrap failed:", err.message);
  process.exit(1);
});
