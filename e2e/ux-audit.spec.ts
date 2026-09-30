import { test, expect } from '@playwright/test'

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
]

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('keeps the conversation shell within the viewport and composer in normal flow', async ({ page }) => {
      await page.goto('/')
      // Wait for the shell before measuring. A bare evaluate() fires while
      // React is still committing, so on a loaded machine it throws
      // "Canonical chat controls are missing" — which is why this test only
      // failed in full-suite runs and never in isolation.
      await expect(page.locator('main')).toBeVisible()
      await expect(page.locator('#composerInput')).toBeVisible()
      const metrics = await page.evaluate(() => {
        const main = document.querySelector('main')
        const composer = document.querySelector('#composerInput')
        if (!main || !composer) throw new Error('Canonical chat controls are missing')
        const mainRect = main.getBoundingClientRect()
        const composerRect = composer.getBoundingClientRect()
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          mainBottom: mainRect.bottom,
          composerTop: composerRect.top,
        }
      })

      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
      expect(metrics.composerTop).toBeGreaterThanOrEqual(metrics.mainBottom - 1)
    })

    test('opens mobile navigation without reserving the desktop sidebar width', async ({ page }) => {
      test.skip(viewport.width >= 768, 'Mobile navigation only applies below the desktop breakpoint')
      await page.goto('/')
      const nav = page.locator('.app-sidebar-nav')
      await expect(nav).toBeVisible()

      // Poll the measured offset instead of sleeping a fixed 250ms. The
      // transform transition is 0.2s, so a fixed sleep is flaky when the
      // machine is loaded and wastefully slow when it is idle.
      const navX = async () => (await nav.boundingBox())?.x ?? 0
      await expect.poll(navX).toBeLessThan(0)

      await page.getByRole('button', { name: 'Open navigation' }).click()
      await expect(nav).toHaveClass(/mobile-open/)
      await expect.poll(navX).toBeGreaterThanOrEqual(0)
      expect(await navX()).toBeLessThan(viewport.width)

      await page.getByRole('button', { name: 'Close navigation' }).click({ position: { x: viewport.width - 20, y: 20 } })
      await expect(nav).not.toHaveClass(/mobile-open/)
      await expect.poll(navX).toBeLessThan(0)
    })

    test('autogrows, scrolls, and resets the canonical composer', async ({ page }) => {
      await page.goto('/')
      const input = page.locator('#composerInput')
      const initialHeight = await input.evaluate((element) => element.getBoundingClientRect().height)
      expect(initialHeight).toBe(44)

      await input.fill(Array.from({ length: 18 }, (_, index) => `Line ${index + 1}: autosize regression content`).join('\n'))
      const long = await input.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
      }))
      expect(long.height).toBe(160)
      expect(long.clientHeight).toBe(160)
      expect(long.scrollHeight).toBeGreaterThan(long.clientHeight)
      expect(long.overflowY).toBe('auto')

      await input.fill('')
      expect(await input.evaluate((element) => element.getBoundingClientRect().height)).toBe(44)
    })

    test('keeps closed drawers inert and restores focus after Escape', async ({ page }) => {
      await page.goto('/')
      const drawer = page.locator('#contextDrawer')

      // Retry rather than read once. React commits state asynchronously, so an
      // evaluate() fired straight after click() can observe the previous
      // render. expect() polls until the committed DOM matches. These assert
      // exactly the same values the old one-shot reads did.
      await expect(drawer).toHaveAttribute('aria-hidden', 'true')
      await expect(drawer).toHaveJSProperty('inert', true)

      const trigger = page.locator('#toggleDrawerBtn')
      await trigger.click()
      await expect(drawer).toHaveAttribute('aria-hidden', 'false')
      await expect(drawer).toHaveAttribute('aria-modal', 'true')
      await expect(drawer).toHaveJSProperty('inert', false)

      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
      await expect(drawer).toHaveAttribute('aria-hidden', 'true')
    })
  })
}
