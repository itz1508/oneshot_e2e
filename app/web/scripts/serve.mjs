import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../dist");

const port = Number(process.env.PORT || 8080);
const backendTarget =
  process.env.ONESHOT_BACKEND_TARGET || "http://127.0.0.1:8787";

const app = express();
app.disable("x-powered-by");

app.use(
  createProxyMiddleware({
    pathFilter: ["/api", "/api/**", "/v1", "/v1/**"],
    target: backendTarget,
    changeOrigin: true,
    timeout: 0,
    proxyTimeout: 0,
    on: {
      error: (err, _req, res) => {
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Backend unavailable (${err.message})` }));
        }
      },
    },
  })
);

app.use(
  express.static(root, {
    index: "index.html",
    maxAge: "1h",
    etag: true,
  })
);

app.use((request, response, _next) => {
  if (request.path.startsWith("/api") || request.path.startsWith("/v1")) {
    return response.status(502).json({ error: "Backend unavailable" });
  }
  if (!request.accepts("html")) return response.status(404).end();
  response.sendFile(path.join(root, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`OneShot Console: http://localhost:${port}`);
  console.log(`OneShot Backend: ${backendTarget}`);
});

