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
      const sidebarBefore = await page.locator('.app-sidebar-nav').boundingBox()
      expect(sidebarBefore?.x ?? 0).toBeLessThan(0)

      await page.getByRole('button', { name: 'Open navigation' }).click()
      await expect(page.locator('.app-sidebar-nav')).toHaveClass(/mobile-open/)
      await page.waitForTimeout(250)
      const sidebarOpen = await page.locator('.app-sidebar-nav').boundingBox()
      expect(sidebarOpen?.x ?? -1).toBeGreaterThanOrEqual(0)
      expect(sidebarOpen?.x ?? 0).toBeLessThan(viewport.width)

      await page.getByRole('button', { name: 'Close navigation' }).click({ position: { x: viewport.width - 20, y: 20 } })
      await expect(page.locator('.app-sidebar-nav')).not.toHaveClass(/mobile-open/)
      await page.waitForTimeout(250)
      const sidebarClosed = await page.locator('.app-sidebar-nav').boundingBox()
      expect(sidebarClosed?.x ?? 0).toBeLessThan(0)
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
      const closed = await page.locator('#contextDrawer').evaluate((element) => ({ inert: element.inert, hidden: element.getAttribute('aria-hidden') }))
      expect(closed.inert).toBe(true)
      expect(closed.hidden).toBe('true')

      const trigger = page.locator('#toggleDrawerBtn')
      await trigger.click()
      const open = await page.locator('#contextDrawer').evaluate((element) => ({ inert: element.inert, hidden: element.getAttribute('aria-hidden'), modal: element.getAttribute('aria-modal') }))
      expect(open.inert).toBe(false)
      expect(open.hidden).toBe('false')
      expect(open.modal).toBe('true')

      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
      await expect(page.locator('#contextDrawer')).toHaveAttribute('aria-hidden', 'true')
    })
  })
}
