import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachNetworkGuard } from "./support/network-guard.ts";

const screenshotsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test-results/screenshots"
);

test.describe("OneShot Modern Agentic Chat — E2E & Security Verification", () => {
    test("Scenario 1: Core Layout & Earlier Conversation Toggle", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");
        await expect(page.locator("text=OneShot").first()).toBeVisible();

        // Earlier Conversation Details
        const earlierDetails = page.locator("#earlierCard");
        await expect(earlierDetails).toBeVisible();

        // Toggle micro-switch
        const toggleSwitch = page.locator("#earlierToggleSwitch");
        await expect(toggleSwitch).toBeVisible();

        // Toggle to summary view
        await toggleSwitch.check({ force: true });
        await expect(page.locator("#earlierSummaryView")).toBeVisible();
        await expect(page.locator("#earlierDetailView")).toBeHidden();

        // Toggle back to detail view
        await toggleSwitch.uncheck({ force: true });
        await expect(page.locator("#earlierDetailView")).toBeVisible();
        await expect(page.locator("#earlierSummaryView")).toBeHidden();

        await page.screenshot({ path: path.join(screenshotsDir, "01-layout-and-earlier-toggle.png"), fullPage: true });
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

        await page.screenshot({ path: path.join(screenshotsDir, "02-drawer-backends-and-gates.png") });
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

        await page.screenshot({ path: path.join(screenshotsDir, "03-server-security-boundary-modal.png") });
        await guard.dispose();
    });

    test("Scenario 4: Real AG-UI Stream Consumption & Safe Unavailable State", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

        // Enter prompt into composer
        const input = page.locator("#composerInput");
        await input.fill("Verify current Tokyo travel preferences");

        // Click send
        const sendBtn = page.locator("#composerSendBtn");
        await sendBtn.click();

        // Verify the empty successful stream is surfaced explicitly; no response is invented.
        const asstMessage = page.locator("#asstContent");
        await expect(asstMessage).toContainText("No response was returned by the provider.");

        // Verify no simulated progress or fake tool execution was fabricated.
        await expect(asstMessage).not.toContainText("Backend Service Unavailable (503)");
        await expect(asstMessage).not.toContainText("Credentials remain server-side per security policy.");

        await page.screenshot({ path: path.join(screenshotsDir, "04-ag-ui-stream-safe-unavailable.png") });
        await guard.dispose();
    });

    test("Scenario 5: Browser Network Isolation Enforcement", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

        // Trigger health endpoint and provider status
        await page.evaluate(async () => {
            await fetch("/api/health").catch(() => {});
            await fetch("/api/providers/status").catch(() => {});
        });

        // Verify zero forbidden external network requests were made by the browser
        expect(guard.unexpectedRequests).toEqual([]);

        await guard.dispose();
    });

    test("Scenario 6: Research Banner & Standalone Researcher Drawer (User-Driven Tavily Search)", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

        // Verify Research Banner exists and is visible
        const researchBanner = page.locator("#researchBanner");
        await expect(researchBanner).toBeVisible();
        await expect(researchBanner).toContainText("Research Mode Active");

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

        await page.screenshot({ path: path.join(screenshotsDir, "05-standalone-researcher-tavily.png") });
        await guard.dispose();
    });

    test("Scenario 7: Tasks Flip Card, Active-Only Todo Chain, Gate 1 Confirmation, & Message Actions", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

        // Open Tasks drawer
        await page.locator("#toggleDrawerBtn").click();
        await page.locator("#tabTaskBtn").click();

        // Verify Active-Only Todo Chain
        const activeSkill = page.locator(".todo-skill.active");
        await expect(activeSkill).toBeVisible();
        await expect(activeSkill).toContainText("ACTIVE");

        // Test Tasks Flip Card (Stage Todos ⇆ Hook Audit Log)
        const flipBtn = page.locator("#tasksFlipBtn");
        await expect(flipBtn).toBeVisible();
        const flipCard = page.locator("#tasksFlipCard");
        await expect(flipCard).not.toHaveClass(/flipped/);

        // Flip to Back (Hook Log)
        await flipBtn.click();
        await expect(flipCard).toHaveClass(/flipped/);
        await expect(page.locator("#hookLogScroll")).toBeVisible();

        // Flip back to Front
        await flipBtn.click();
        await expect(flipCard).not.toHaveClass(/flipped/);

        // Test Gate 1 Plan Card confirmation
        const planCard = page.locator("#planReviewCard");
        await expect(planCard).toBeVisible();
        const confirmBtn = page.locator("#confirmPlanBtn");
        await confirmBtn.click();
        await expect(page.locator("#gate1Badge")).toHaveText("CONFIRMED");

        // Test real Message Content Actions (Copy & Fork)
        const copyBtn = page.getByRole("button", { name: "Copy message to clipboard" }).first();
        await expect(copyBtn).toBeVisible();
        await copyBtn.click();
        await expect(copyBtn).toHaveText(/Copied|Clipboard unavailable/);

        const forkBtn = page.getByRole("button", { name: "Fork conversation from this message" }).first();
        await expect(forkBtn).toBeVisible();
        await forkBtn.click();
        await expect(forkBtn).toHaveText(/Branch|Fork unavailable/);

        await page.screenshot({ path: path.join(screenshotsDir, "06-flipcard-todos-and-gate-confirm.png") });
        await guard.dispose();
    });
});
