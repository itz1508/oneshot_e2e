import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { attachNetworkGuard } from "./support/network-guard";

const screenshotsDir = "C:/Users/itz15/.gemini/antigravity-ide/brain/b929d9ad-bec2-4972-b3ae-ff631a326281/screenshots";

test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }
});

test.describe("Researcher Workflow Demo Static Embed E2E", () => {
    test("Primary E2E scenario: straight success", async ({ page }) => {
        const pageErrors: Error[] = [];
        const consoleErrors: string[] = [];
        page.on("pageerror", (err) => pageErrors.push(err));
        page.on("console", (msg) => {
            if (msg.type() === "error") consoleErrors.push(msg.text());
        });

        const guard = attachNetworkGuard(page);

        // 1. Open the static embed entry point
        await page.goto("/embed/researcher-workflow-demo.html");

        // 2. Confirm the page loads without browser console errors
        expect(consoleErrors).toEqual([]);
        expect(pageErrors).toEqual([]);

        // 3. Confirm the initial simulation state is idle
        const stateElem = page.locator("strong[data-state]");
        await expect(stateElem).toHaveText("idle");

        // 4. Confirm the deterministic-simulation copy is visible
        await expect(
            page.getByText("Deterministic simulation controls", { exact: false })
                .or(page.getByText("deterministic simulation preview", { exact: false }))
                .or(page.getByText("This static simulation preview mirrors the product layout", { exact: false }))
                .first()
        ).toBeVisible();

        // Capture screenshot: idle state
        await page.screenshot({ path: path.join(screenshotsDir, "idle-state.png"), fullPage: true });

        // 5. Select the straight-success fixture
        const straightOption = page.locator('input[name="fixture"][value="straight-success"]');
        await straightOption.check();

        // 6. Click Start
        const startBtn = page.getByRole("button", { name: "Start" });
        await expect(startBtn).toBeVisible();
        await startBtn.click();

        // 7. Wait for the visible state to become review
        await expect(stateElem).toHaveText("review", { timeout: 10_000 });

        // 8. Confirm progress is rendered under an element carrying data-source="fixture"
        const fixtureProgressContainer = page.locator('[data-source="fixture"]');
        await expect(fixtureProgressContainer).toBeVisible();

        // 9. Confirm exactly six progress items are visible
        const progressItems = fixtureProgressContainer.locator("li.agent-progress-row");
        await expect(progressItems).toHaveCount(6);

        // 10. Confirm four items are completed
        const completedItems = fixtureProgressContainer.locator('li.agent-progress-row[data-status="completed"]');
        await expect(completedItems).toHaveCount(4);

        // 11. Confirm one item is in progress
        const inProgressItems = fixtureProgressContainer.locator('li.agent-progress-row[data-status="in_progress"]');
        await expect(inProgressItems).toHaveCount(1);

        // 12. Confirm one item is pending
        const pendingItems = fixtureProgressContainer.locator('li.agent-progress-row[data-status="pending"]');
        await expect(pendingItems).toHaveCount(1);

        // 13. Confirm the sourced review card is visible
        const reviewCard = page.locator(".fixture-review");
        await expect(reviewCard).toBeVisible();

        // 14. Confirm the expected fixture chat entries are visible
        const chatLog = page.locator("[data-chat-log]");
        await expect(chatLog).toContainText("Research keyboard focus visibility");
        await expect(chatLog).toContainText("Ready for planning: the simulated research summary contains cited focus-visible and status-message findings.");

        // Capture screenshot: straight-success review state
        await page.screenshot({ path: path.join(screenshotsDir, "straight-success-review-state.png"), fullPage: true });

        // 15. Click Continue
        const continueBtn = page.getByRole("button", { name: "Continue" });
        await expect(continueBtn).toBeVisible();
        await expect(continueBtn).toBeEnabled();
        await continueBtn.click();

        // 16. Confirm all six progress items are completed
        await expect(completedItems).toHaveCount(6, { timeout: 10_000 });

        // 17. Confirm the final state is ready for planning
        await expect(stateElem).toHaveText("ready for planning");

        // 18. Confirm no failure or cancellation message is visible
        await expect(page.locator(".fixture-status-card")).toHaveCount(0);
        await expect(page.getByText(/canceled/i)).toHaveCount(0);

        // Capture screenshot: straight-success completed state
        await page.screenshot({ path: path.join(screenshotsDir, "straight-success-completed-state.png"), fullPage: true });

        // Network and error checks
        expect(guard.unexpectedRequests).toHaveLength(0);
        expect(pageErrors).toHaveLength(0);
        expect(consoleErrors).toHaveLength(0);
        await guard.dispose();
    });

    test("Correction-loop scenario", async ({ page }) => {
        const pageErrors: Error[] = [];
        const consoleErrors: string[] = [];
        page.on("pageerror", (err) => pageErrors.push(err));
        page.on("console", (msg) => {
            if (msg.type() === "error") consoleErrors.push(msg.text());
        });

        const guard = attachNetworkGuard(page);

        await page.goto("/embed/researcher-workflow-demo.html");

        // 1. Select section-change-reloop
        const reloopOption = page.locator('input[name="fixture"][value="section-change-reloop"]');
        await reloopOption.check();

        // 2. Click Start
        const startBtn = page.getByRole("button", { name: "Start" });
        await startBtn.click();

        // 3. Wait for review state
        const stateElem = page.locator("strong[data-state]");
        await expect(stateElem).toHaveText("review", { timeout: 10_000 });

        // 4. Click Continue before applying the correction
        const continueBtn = page.locator("[data-continue]");
        await expect(continueBtn).toBeVisible();
        // Since button is disabled in UI before correction, dispatch click directly to test the continue paused handler
        await continueBtn.dispatchEvent("click");

        // 5. Confirm the fixture remains in review
        await expect(stateElem).toHaveText("review");

        // 6. Confirm this message is visible: Continue paused until sourced section changes are done.
        const chatLog = page.locator("[data-chat-log]");
        await expect(chatLog).toContainText("Continue paused until sourced section changes are done.");

        // Capture screenshot: section-change blocked state
        await page.screenshot({ path: path.join(screenshotsDir, "section-change-blocked-state.png"), fullPage: true });

        // 7. Use the existing section Change control
        const changeBtn = page.locator('button.section-action[data-section="facts-sources"]');
        await expect(changeBtn).toBeVisible();
        await changeBtn.click();

        // 8. Confirm the fixture enters the correction or re-loop behavior
        await expect(chatLog).toContainText("Returning only to the affected Facts and Sources section.");

        // 9. Wait for it to return to review
        await expect(stateElem).toHaveText("review", { timeout: 10_000 });
        await expect(chatLog).toContainText("Revised sourced finding displayed; Continue is now available.");

        // 10. Confirm the corrected review content is visible
        await expect(page.locator(".fixture-section--revised")).toBeVisible();
        await expect(page.locator(".fixture-review")).toContainText("After correction: use programmatically determinable status messages");

        // Capture screenshot: section-change corrected state
        await page.screenshot({ path: path.join(screenshotsDir, "section-change-corrected-state.png"), fullPage: true });

        // 11. Click Continue
        await expect(continueBtn).toBeEnabled();
        await continueBtn.click();

        // 12. Confirm the final state becomes ready for planning
        await expect(stateElem).toHaveText("ready for planning", { timeout: 10_000 });

        expect(guard.unexpectedRequests).toHaveLength(0);
        expect(pageErrors).toHaveLength(0);
        expect(consoleErrors).toHaveLength(0);
        await guard.dispose();
    });

    test("Cancellation scenario", async ({ page }) => {
        const pageErrors: Error[] = [];
        const consoleErrors: string[] = [];
        page.on("pageerror", (err) => pageErrors.push(err));
        page.on("console", (msg) => {
            if (msg.type() === "error") consoleErrors.push(msg.text());
        });

        const guard = attachNetworkGuard(page);

        await page.goto("/embed/researcher-workflow-demo.html");

        // 1. Select either fixture
        const straightOption = page.locator('input[name="fixture"][value="straight-success"]');
        await straightOption.check();

        // 2. Click Start
        const startBtn = page.getByRole("button", { name: "Start" });
        await startBtn.click();

        // 3. Click Cancel before successful completion
        const cancelBtn = page.getByRole("button", { name: "Cancel" });
        await expect(cancelBtn).toBeVisible();
        await cancelBtn.click();

        // 4. Confirm the state becomes canceled using the exact existing fixture spelling
        const stateElem = page.locator("strong[data-state]");
        await expect(stateElem).toHaveText("canceled");

        // 5. Confirm the cancellation explanation is visible
        const statusCard = page.locator(".fixture-status-card");
        await expect(statusCard).toBeVisible();
        await expect(statusCard).toContainText("Cancel stopped the simulation path. Ready for planning was not reached.");

        // 6. Confirm "Ready for planning" was not reached
        await expect(stateElem).not.toHaveText("ready for planning");

        // 7. Confirm no successful-completion state is displayed
        await expect(page.locator(".agent-progress-card")).toHaveCount(0);

        // Capture screenshot: canceled state
        await page.screenshot({ path: path.join(screenshotsDir, "canceled-state.png"), fullPage: true });

        expect(guard.unexpectedRequests).toHaveLength(0);
        expect(pageErrors).toHaveLength(0);
        expect(consoleErrors).toHaveLength(0);
        await guard.dispose();
    });

    test("Fixture switching scenario", async ({ page }) => {
        const pageErrors: Error[] = [];
        const consoleErrors: string[] = [];
        page.on("pageerror", (err) => pageErrors.push(err));
        page.on("console", (msg) => {
            if (msg.type() === "error") consoleErrors.push(msg.text());
        });

        const guard = attachNetworkGuard(page);

        await page.goto("/embed/researcher-workflow-demo.html");

        // 1. Start one fixture
        const straightOption = page.locator('input[name="fixture"][value="straight-success"]');
        await straightOption.check();
        const startBtn = page.getByRole("button", { name: "Start" });
        await startBtn.click();

        // Wait for it to become review
        const stateElem = page.locator("strong[data-state]");
        await expect(stateElem).toHaveText("review", { timeout: 10_000 });

        // 2. Switch the selected fixture using the existing radio control
        const reloopOption = page.locator('input[name="fixture"][value="section-change-reloop"]');
        await reloopOption.check();

        // 3. Confirm state resets to idle
        await expect(stateElem).toHaveText("idle");

        // 4. Confirm previous progress is cleared
        const idleNote = page.locator("[data-idle-note]");
        await expect(idleNote).toBeVisible();
        await expect(page.locator(".agent-progress-card")).toHaveCount(0);

        // 5. Confirm previous fixture chat state is cleared
        const chatLog = page.locator("[data-chat-log]");
        await expect(chatLog).toContainText("Simulation reset. Start and Cancel are available; Ready for planning is not available.");

        expect(guard.unexpectedRequests).toHaveLength(0);
        expect(pageErrors).toHaveLength(0);
        expect(consoleErrors).toHaveLength(0);
        await guard.dispose();
    });

    test("Local chat scenario", async ({ page }) => {
        const pageErrors: Error[] = [];
        const consoleErrors: string[] = [];
        page.on("pageerror", (err) => pageErrors.push(err));
        page.on("console", (msg) => {
            if (msg.type() === "error") consoleErrors.push(msg.text());
        });

        const guard = attachNetworkGuard(page);

        await page.goto("/embed/researcher-workflow-demo.html");

        // Fill and submit the static preview chat
        const input = page.getByPlaceholder("Ask about focus indicators or live-region status messages…");
        await expect(input).toBeVisible();
        await input.fill("What are the focus indicator requirements?");

        const sendBtn = page.getByRole("button", { name: "Send" });
        await sendBtn.click();

        // 1. Appends the user message locally
        const chatLog = page.locator("[data-chat-log]");
        await expect(chatLog.locator(".human-message").last()).toHaveText("What are the focus indicator requirements?");

        // 2. Displays the fixture's existing local-preview response
        await expect(chatLog.locator(".ai-message").last()).toHaveText(
            "Static preview captured the message locally. Use the React app for live stream submission."
        );

        // 3. Makes no external request
        expect(guard.unexpectedRequests).toHaveLength(0);

        // 4. Does not claim a live response
        await expect(chatLog).not.toContainText("Live response connected");

        expect(pageErrors).toHaveLength(0);
        expect(consoleErrors).toHaveLength(0);
        await guard.dispose();
    });
});
