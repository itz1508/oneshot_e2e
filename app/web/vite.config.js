import { defineConfig } from "vite";

const backendTarget =
  process.env.ONESHOT_BACKEND_TARGET || "http://127.0.0.1:8787";

export default defineConfig({
  root: "src",

  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },

  preview: {
    host: "0.0.0.0",
    port: 4173,
  },

  build: {
    target: "es2022",
    sourcemap: true,
    outDir: "../dist",
    emptyOutDir: true,
  },
});
