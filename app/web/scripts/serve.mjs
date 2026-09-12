import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../dist", import.meta.url));
const target = process.env.ONESHOT_BACKEND_TARGET || "http://127.0.0.1:8787";
const port = Number(process.env.PORT || 3000);

const app = express();

app.use(
    "/api",
    createProxyMiddleware({
        target,
        changeOrigin: true,
        logLevel: "silent",
    }),
);

app.use(
    "/v1",
    createProxyMiddleware({
        target,
        changeOrigin: true,
        logLevel: "silent",
    }),
);

app.use(express.static(root, { fallthrough: true }));

app.get("*", (_req, res) => {
    res.sendFile(path.join(root, "index.html"));
});

app.listen(port, () => {
    console.log(`OneShot frontend preview listening on http://127.0.0.1:${port}`);
});
