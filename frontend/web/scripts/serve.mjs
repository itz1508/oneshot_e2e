#!/usr/bin/env node

import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: node frontend/web/scripts/serve.mjs [--port <port>]");
  console.log("Options:");
  console.log("  --port, -p    Port to listen on (default: 8080 or PORT env)");
  console.log("  --help, -h    Show this help message");
  process.exit(0);
}

if (!existsSync(distDir)) {
  console.error(`[OneShot Frontend] dist directory not found at ${distDir}. Run 'pnpm run build' first.`);
  process.exit(1);
}

const app = express();
const port = parseInt(process.env.PORT || "8080", 10);
const backendTarget = process.env.ONESHOT_BACKEND_TARGET || process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:4000";

// Proxy /api requests to backend
app.use(
  "/api",
  createProxyMiddleware({
    target: backendTarget,
    changeOrigin: true,
    ws: true,
  })
);

// Serve static export files
app.use(express.static(distDir));

// Fallback to index.html for client-side routing
app.use((_req, res) => {
  const indexPath = path.join(distDir, "index.html");
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Not Found");
  }
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`[OneShot Frontend] Static preview running at http://localhost:${port}`);
  console.log(`[OneShot Frontend] Proxying /api -> ${backendTarget}`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
