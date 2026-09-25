import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "..");

export default defineConfig({
    testDir: "./",
    testMatch: ["**/*.spec.ts"],
    timeout: 30_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: false,
    workers: 1,
    projects: [
        {
            name: "chromium",
            use: {
                baseURL: "http://127.0.0.1:4173",
                headless: true,
                screenshot: "off",
                video: "off",
                trace: "off",
                launchOptions: {
                    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
                },
            },
        },
    ],
    use: {
        baseURL: "http://127.0.0.1:4173",
        launchOptions: {
            args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        },
    },
    webServer: {
        // The e2e suite runs against the REAL backend. It previously ran against
        // e2e/support/static-server.mjs, a copy-paste of 22 backend routes that
        // silently drifted: it could pass while the shipped backend was broken.
        // Serving static files is already a backend responsibility, so the copy
        // has been deleted rather than maintained.
        command: "node --import tsx backend/index.ts",
        cwd: repoRoot,
        env: { PORT: "4173" },
        url: "http://127.0.0.1:4173/index.html",
        reuseExistingServer: true,
        timeout: 30_000,
    },
});
