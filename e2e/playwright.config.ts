import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

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
                headless: true,
                screenshot: "off",
                video: "off",
                trace: "off",
            },
        },
    ],
    use: {
        baseURL: "http://127.0.0.1:4173",
    },
    webServer: {
        command: "node e2e/support/static-server.mjs",
        cwd: repoRoot,
        url: "http://127.0.0.1:4173/embed/researcher-workflow-demo.html",
        reuseExistingServer: true,
        timeout: 15_000,
    },
});
