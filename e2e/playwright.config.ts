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
        command: "node --import tsx e2e/support/static-server.mjs",
        cwd: repoRoot,
        url: "http://127.0.0.1:4173/index.html",
        reuseExistingServer: true,
        timeout: 15_000,
    },
});
