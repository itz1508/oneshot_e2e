import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachNetworkGuard } from "./support/network-guard.ts";

const screenshotsOutputDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test-results/screenshots"
);

test.describe("OneShot Modern Agentic Chat — E2E & Security Verification", () => {
    test("Scenario 1: Fresh Workspace Starts Without Fabricated Content", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");
        await expect(page.locator("text=OneShot").first()).toBeVisible();
        await expect(page.getByText("Start a real OneShot run", { exact: true })).toBeVisible();
        await expect(page.locator("#earlierCard")).toHaveCount(0);
        await expect(page.locator("text=OneShot Autonomous Software Engineering Fleet")).toHaveCount(0);

        await page.screenshot({ path: path.join(screenshotsOutputDir, "01-fresh-workspace.png"), fullPage: true });
        await guard.dispose();
    });

    test("Scenario 2: Context Review Drawer 3-Tab Navigation & Invariant Gates", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

        // Open drawer via toggle button
        const toggleBtn = page.locator("#toggleDrawerBtn");
        await toggleBtn.click();
        const drawer = page.locator("#contextDrawer");
        await expect(drawer).toHaveClass(/open/);

        // Tab: Tasks (Human Invariant Gates)
        const tabTaskBtn = page.locator("#tabTaskBtn");
        await tabTaskBtn.click();
        await expect(page.locator("text=Gate 1: Research Review")).toBeVisible();
        await expect(page.locator("text=Gate 2: Build Ready")).toBeVisible();

        // Tab: Backends (DeepAgents Partition Routing & Sandbox)
        const tabBackendsBtn = page.locator("#tabBackendsBtn");
        await tabBackendsBtn.click();
        await expect(page.locator("text=/workspace/").first()).toBeVisible();
        await expect(page.locator("text=/scratch/").first()).toBeVisible();
        await expect(page.locator("text=/memories/").first()).toBeVisible();
        await expect(page.locator("text=/artifacts/").first()).toBeVisible();
        await expect(page.locator("text=virtual_mode").first()).toBeVisible();

        await page.screenshot({ path: path.join(screenshotsOutputDir, "02-drawer-backends-and-gates.png") });
        await guard.dispose();
    });

    test("Scenario 3: Server Security Boundary in Provider Modal", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

        // Click integration config open button
        const openModalBtn = page.locator(".provider-open-btn").first();
        await openModalBtn.click();

        const modal = page.locator("#providerModal");
        await expect(modal).toHaveClass(/open/);

        // Verify Server Security Boundary notice is displayed
        await expect(page.locator("text=Server Security Boundary")).toBeVisible();
        await expect(page.locator("#serverBadge")).toHaveText("SERVER-OWNED");

        // Security assertion: NO password input or API key input in DOM
        const passwordInputs = page.locator('input[type="password"]');
        await expect(passwordInputs).toHaveCount(0);

        // Probe server status
        const testBtn = page.locator("#modalTestBtn");
        await testBtn.click();
        await expect(page.locator("#modalStatusText")).not.toBeEmpty();

        await page.screenshot({ path: path.join(screenshotsOutputDir, "03-server-security-boundary-modal.png") });
        await guard.dispose();
    });

    test("Scenario 4: Real Local AG-UI Stream Consumption", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

        const input = page.locator("#composerInput");
        await input.fill("Verify the response verification invariant with Python reasoning");
        const responsePromise = page.waitForResponse(
            (response) => response.url().endsWith("/api/agent/stream") && response.request().method() === "POST",
        );
        await page.locator("#composerSendBtn").click();
        const response = await responsePromise;
        expect(response.status()).toBe(200);

        const asstMessage = page.locator("#asstContent");
        await expect(asstMessage).toContainText("Local Python reasoning engine", { timeout: 15_000 });
        await expect(asstMessage).not.toContainText("Backend Service Unavailable (503)");
        await expect(asstMessage).not.toContainText("Credentials remain server-side per security policy.");
        await expect(page.getByText("Backend agent stream completed", { exact: true })).toBeVisible();

        await page.screenshot({ path: path.join(screenshotsOutputDir, "04-real-local-ag-ui-stream.png") });
        await guard.dispose();
    });

    test("Scenario 5: Browser Network Isolation Enforcement", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

        // Trigger health endpoint and provider status
        await page.evaluate(async () => {
            const [healthResponse, statusResponse] = await Promise.all([
                fetch("/api/health"),
                fetch("/api/providers/status"),
            ]);
            if (!healthResponse.ok || !statusResponse.ok) throw new Error("Local API health probe failed");
            const [health, status] = await Promise.all([healthResponse.json(), statusResponse.json()]);
            if (health?.ok !== true || health?.status !== "healthy" || !status || typeof status !== "object") {
                throw new Error("Local API health payload failed validation");
            }
        });

        // Verify zero forbidden external network requests were made by the browser
        expect(guard.unexpectedRequests).toEqual([]);

        await guard.dispose();
    });

    test("Scenario 6: Research Banner Reports Real State & Standalone Researcher Drawer", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

        // The banner must reflect real backend state. With no research run, it must
        // NOT claim a mode is active (ARCHITECTURE.MD §1.7 / repo no-fake-state rule).
        const researchBanner = page.locator("#researchBanner");
        await expect(researchBanner).toBeVisible();
        await expect(researchBanner).toContainText("Research not running");
        await expect(researchBanner).not.toContainText("Research Mode Active");

        // Per-message research choice is an explicit toggle, not a global driver.
        const useResearchToggle = page.locator("#useResearchToggle");
        await expect(useResearchToggle).toBeVisible();
        await expect(useResearchToggle).not.toBeChecked();
        await useResearchToggle.check();
        await expect(useResearchToggle).toBeChecked();

        // Design_Planning has its own explicit control, separate from Research.
        const designPlanningBtn = page.locator("#designPlanningBtn");
        await expect(designPlanningBtn).toBeVisible();

        // Verify Researcher button
        const researcherBtn = page.locator("#researcherBtn");
        await expect(researcherBtn).toBeVisible();
        await expect(researcherBtn).toContainText("Researcher");

        // Click Researcher button to open standalone drawer
        await researcherBtn.click();
        const researcherDrawer = page.locator("#researcherDrawer");
        await expect(researcherDrawer).toHaveClass(/open/);

        // Perform user-driven Tavily search
        const searchInput = page.locator("#tavilySearchInput");
        await searchInput.fill("OneShot architecture invariants");
        const searchBtn = page.locator("#tavilySearchBtn");
        await searchBtn.click();

        // Verify the real unavailable state; no synthetic research records may appear.
        await expect(page.locator("#researcherDrawer")).toContainText("Research search is currently unavailable", { timeout: 5_000 });
        await expect(page.locator(".insert-cite-btn")).toHaveCount(0);
        await expect(page.locator("#researcherDrawer")).not.toContainText("Architecture and Invariants Analysis");

        // Close researcher drawer using the real accessible close control.
        await page.locator("#closeResearcherDrawerBtn").click();
        await expect(researcherDrawer).not.toHaveClass(/open/);

        await page.screenshot({ path: path.join(screenshotsOutputDir, "05-standalone-researcher-tavily.png") });
        await guard.dispose();
    });

<<<<<<< HEAD
    test("Scenario 7: Real Run Activity, Hook Log, Gate 1 Confirmation, & Message Actions", async ({ page }) => {
=======
    test("Scenario 6b: Governed Research Stops At The Planning Handoff", async ({ page }) => {
>>>>>>> rebuild-researcher-only
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

<<<<<<< HEAD
=======
        // A research run must stop at READY_FOR_PLANNING and never invoke planning.
        const research = await page.evaluate(async () => {
            const res = await fetch("/api/research/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ intent: "OneShot architecture invariants", search: { enabled: false } }),
            });
            if (!res.ok) throw new Error(`Research run failed: ${res.status}`);
            return await res.json();
        });

        expect(research.phase).toBe("READY_FOR_PLANNING");
        expect(research.stopped).toBe(true);
        expect(research.handoffReady).toBe(true);
        expect(research.bundle.decisionOwner).toBe("Design_Planning");
        // Search was disabled, so no sources may be invented.
        expect(Array.isArray(research.bundle.sources)).toBe(true);
        expect(research.bundle.sources.length).toBe(0);
        expect(research.issues.length).toBeGreaterThan(0);

        // Planning is never auto-triggered and refuses an unfinished handoff.
        const blocked = await page.evaluate(async () => {
            const res = await fetch("/api/design-planning/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    explicitlyInvoked: true,
                    intent: "plan the thing",
                    researchRun: { runId: "r1", phase: "RESEARCHING", startedAt: "t" },
                }),
            });
            return { status: res.status, body: await res.json() };
        });
        expect(blocked.status).toBe(409);
        expect(blocked.body.phase).toBe("RESEARCHING");

        // Planning without explicit invocation is refused.
        const notExplicit = await page.evaluate(async () => {
            const res = await fetch("/api/design-planning/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ intent: "plan the thing", explicitlyInvoked: false }),
            });
            return res.status;
        });
        expect(notExplicit).toBe(400);

        await guard.dispose();
    });

    test("Scenario 7: Real Run Activity, Hook Log, Gate 1 Confirmation, & Message Actions", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

>>>>>>> rebuild-researcher-only
        // Start a real local run.
        const input = page.locator("#composerInput");
        await input.fill("research the response verification invariant with Python reasoning");
        await page.locator("#composerSendBtn").click();
        await expect(page.getByText("Backend agent stream completed", { exact: true })).toBeVisible({ timeout: 15_000 });

        // Sending a real run opens the Tasks drawer automatically.
        const drawer = page.locator("#contextDrawer");
        await expect(drawer).toHaveClass(/open/);
        await page.locator("#tabTaskBtn").click();
        await expect(page.getByText("Python reasoning subprocess", { exact: true })).toBeVisible();
        await expect(page.getByText("No activity steps have been emitted for this run.")).toHaveCount(0);

        // Test Tasks Flip Card (real activity ⇆ real event log).
        const flipBtn = page.locator("#tasksFlipBtn");
        await expect(flipBtn).toBeVisible();
        const flipCard = page.locator("#tasksFlipCard");
        await expect(flipCard).not.toHaveClass(/flipped/);
        await flipBtn.click();
        await expect(flipCard).toHaveClass(/flipped/);
        await expect(page.locator("#hookLogScroll")).toBeVisible();
        await expect(page.locator("#hookLogScroll").getByText(/Python reasoning subprocess \[completed\]/)).toBeVisible();
        await flipBtn.click();
        await expect(flipCard).not.toHaveClass(/flipped/);

        // Gate 1 remains explicit until confirmation.
        await expect(page.getByText("PENDING_APPROVAL", { exact: true }).first()).toBeVisible();

        // Test real Message Content Actions (Copy & Fork).
        const copyBtn = page.getByRole("button", { name: "Copy message to clipboard" }).first();
        await expect(copyBtn).toBeVisible();
        await copyBtn.click();
        await expect(copyBtn).toHaveText(/Copied|Clipboard unavailable/);

        const forkBtn = page.getByRole("button", { name: "Fork conversation from this message" }).first();
        await expect(forkBtn).toBeVisible();
        await forkBtn.click();
        await expect(forkBtn).toHaveText(/Branch|Fork unavailable/);

        await page.screenshot({ path: path.join(screenshotsOutputDir, "06-real-run-activity-and-gate.png") });
        await guard.dispose();
    });
});
