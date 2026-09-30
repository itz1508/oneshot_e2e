import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachNetworkGuard } from "./support/network-guard.ts";

const screenshotsOutputDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test-results/screenshots"
);

/**
 * Parse the `event:` names out of an AG-UI SSE body, in arrival order.
 *
 * Scenarios 4 and 7 assert on this rather than on a particular reasoning
 * engine. `POST /api/agent/stream` branches on whether live credentials exist
 * (ARCHITECTURE.MD 2.1), so a label like "Local Python reasoning engine" or
 * "Python reasoning subprocess" only ever appears on a machine with no usable
 * provider key. Asserting them made the scenarios environment-dependent: they
 * failed on a credentialed install even when the stream was entirely correct.
 * The lifecycle below is emitted by both branches.
 */
function readSseEvents(body: string): string[] {
  return [...body.matchAll(/^event:\s*(\S+)/gm)].map((match) => match[1]!);
}

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

        // Tab: Backends (Agent Partition Routing & Sandbox)
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

        // Security assertion: the provider modal collects no secret at all, so it
        // must contain NO password input. A pasted credential is typed in the
        // workflow console instead, where it is masked behind an explicit
        // show/hide toggle rather than rendered in clear text.
        const passwordInputs = modal.locator('input[type="password"]');
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

        // Assert the AG-UI lifecycle every correct run must emit, rather than
        // which engine produced it. A run that answers 200 but never opens the
        // lifecycle, streams no deltas, or never finishes still fails here, so
        // this is not a weakened substitute for the old text match.
        const events = readSseEvents(await response.text());
        expect(events[0]).toBe("RUN_START");
        expect(events.filter((event) => event === "TEXT_MESSAGE_DELTA").length).toBeGreaterThan(0);
        expect(events[events.length - 1]).toBe("RUN_FINISH");

        // Those deltas must have reached the DOM as real assistant content.
        const asstMessage = page.locator("#asstContent");
        await expect(asstMessage).not.toBeEmpty();
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

        // Verify the real backend response; no synthetic research records may appear.
        await expect(page.locator("#researcherDrawer")).toContainText(/Research search is currently unavailable|Research Sources/, { timeout: 10_000 });
        await expect(page.locator("#researcherDrawer")).not.toContainText("Architecture and Invariants Analysis");

        // Close researcher drawer using the real accessible close control.
        await page.locator("#closeResearcherDrawerBtn").click();
        await expect(researcherDrawer).not.toHaveClass(/open/);

        await page.screenshot({ path: path.join(screenshotsOutputDir, "05-standalone-researcher-tavily.png") });
        await guard.dispose();
    });

    test("Scenario 6b: Governed Research Stops At The Planning Handoff", async ({ page }) => {
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

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

    test("Scenario 7: Real Run Activity, Hook Log, Gate 1 Confirmation, & Message Actions", async ({ page, context }) => {
        // The default 30s budget assumed a run that failed fast. This scenario
        // now drives a real model that makes several tool calls, so it needs room
        // for the run plus the drawer, flip-card and message-action assertions.
        test.setTimeout(120_000);
        const guard = attachNetworkGuard(page);

        await page.goto("http://127.0.0.1:4173/index.html");

        // Start a real run.
        const firstMessageText = "research the response verification invariant with Python reasoning";
        const input = page.locator("#composerInput");
        await input.fill(firstMessageText);
        await page.locator("#composerSendBtn").click();
        // 60s, not 15s: once provider resolution was fixed this drives an actual
        // model that makes several tool calls before it finishes. 15s only held
        // while the run was being rejected with 503 and returning instantly.
        await expect(page.getByText("Backend agent stream completed", { exact: true })).toBeVisible({ timeout: 60_000 });

        // Sending a real run opens the Tasks drawer automatically.
        const drawer = page.locator("#contextDrawer");
        await expect(drawer).toHaveClass(/open/);
        await page.locator("#tabTaskBtn").click();
        // A real run emits lifecycle steps and at least one reaches COMPLETED.
        // The step label itself is engine-specific (the local reasoner reports
        // "Python reasoning subprocess", the live agent reports its own callback
        // names), so assert the completed lifecycle rather than one branch's
        // label. The empty state would satisfy a bare "drawer is open" check.
        await expect(page.getByText("No activity steps have been emitted for this run.")).toHaveCount(0);
        await expect(
            page.locator("#tasksFlipCard").getByText("COMPLETED", { exact: true }).first()
        ).toBeVisible();

        // Test Tasks Flip Card (real activity ⇆ real event log).
        const flipBtn = page.locator("#tasksFlipBtn");
        await expect(flipBtn).toBeVisible();
        const flipCard = page.locator("#tasksFlipCard");
        await expect(flipCard).not.toHaveClass(/flipped/);
        await flipBtn.click();
        await expect(flipCard).toHaveClass(/flipped/);
        await expect(page.locator("#hookLogScroll")).toBeVisible();
        // The ledger must record at least one completed step. "[completed]" is
        // appended by the client for every pipeline step on both branches.
        await expect(page.locator("#hookLogScroll").getByText(/\[completed\]/).first()).toBeVisible();
        await flipBtn.click();
        await expect(flipCard).not.toHaveClass(/flipped/);

        // Gate 1 remains explicit until confirmation.
        await expect(page.getByText("PENDING_APPROVAL", { exact: true }).first()).toBeVisible();

        // Test real Message Content Actions (Copy & Fork). Both buttons show a
        // 1500ms transient confirmation and then reset, so matching the label
        // races that window and failed intermittently. Assert the contract the
        // label stands for instead: the clipboard really receives the message,
        // and the fork really returns a new session.
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        const copyBtn = page.getByRole("button", { name: "Copy message to clipboard" }).first();
        await expect(copyBtn).toBeVisible();
        // The action buttons live on the assistant bubble, so the clipboard must
        // receive that bubble's content, not the prompt that was typed. The
        // clipboard gets the raw string while the DOM renders markdown, so this
        // compares a normalized prefix rather than the full text: emphasis and
        // list markers are rendered away, and chasing every markdown form would
        // make the assertion brittle without making it stronger.
        const normalize = (value: string) =>
            value.replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
        const renderedPrefix = normalize(
            await page.locator("#asstContent").first().innerText()
        ).slice(0, 60);
        expect(renderedPrefix.length).toBeGreaterThan(0);
        await copyBtn.click();
        await expect
            .poll(
                async () => normalize(await page.evaluate(() => navigator.clipboard.readText())),
                { timeout: 10_000 }
            )
            .toContain(renderedPrefix);

        const forkResponsePromise = page.waitForResponse(
            (response) => response.url().endsWith("/api/session/fork") && response.request().method() === "POST",
        );
        const forkBtn = page.getByRole("button", { name: "Fork conversation from this message" }).first();
        await expect(forkBtn).toBeVisible();
        await forkBtn.click();
        const forkResponse = await forkResponsePromise;
        expect(forkResponse.status()).toBe(200);
        const forkBody = JSON.parse(await forkResponse.text()) as { forked?: boolean; newSessionId?: string };
        expect(forkBody.forked).toBe(true);
        expect(typeof forkBody.newSessionId).toBe("string");
        expect((forkBody.newSessionId ?? "").length).toBeGreaterThan(0);

        await page.screenshot({ path: path.join(screenshotsOutputDir, "06-real-run-activity-and-gate.png") });
        await guard.dispose();
    });
});
