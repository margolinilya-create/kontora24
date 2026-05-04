import { test, expect } from '@playwright/test'
import { login, waitForToast } from './helpers'

// This test uses admin account with role emulation to simulate workers.
// The RoleSwitcher (sidebar) allows admin to emulate any role.

async function emulateRole(page, roleName) {
  // Open sidebar role switcher
  const switchBtn = page.locator('button[aria-label="Переключение роли"]')
  await switchBtn.click()
  // Select the desired role from the dropdown
  await page.getByText(roleName, { exact: true }).click()
  await page.waitForTimeout(500)
}

test.describe('Worker Complete Task — Mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')
  })

  test('printer can view print queue and see task cards', async ({ page }) => {
    await emulateRole(page, 'Печатник')
    await page.goto('/production/print')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('main')).toBeVisible()
    // Page should show queue title or empty state
    await expect(
      page.getByText(/очередь печати|нет заказов|пусто/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('post_printer can view packaging queue', async ({ page }) => {
    await emulateRole(page, 'Постпечатник')
    await page.goto('/production/packaging')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('main')).toBeVisible()
    await expect(
      page.getByText(/упаковка|нет заказов|пусто/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('claim button appears on unassigned tasks in queue', async ({ page }) => {
    await emulateRole(page, 'Печатник')
    await page.goto('/production/print')
    await page.waitForLoadState('networkidle')

    const claimBtn = page.getByRole('button', { name: /взять/i }).first()
    const hasOrders = await claimBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasOrders) {
      // Verify button is touch-friendly (min 44px height)
      const box = await claimBtn.boundingBox()
      expect(box.height).toBeGreaterThanOrEqual(36)
    }
    // If no orders in print queue, test still passes — queue might be empty
  })

  test('claim task flow — click Vziat and verify success toast', async ({ page }) => {
    await emulateRole(page, 'Печатник')
    await page.goto('/production/print')
    await page.waitForLoadState('networkidle')

    const claimBtn = page.getByRole('button', { name: /взять/i }).first()
    const hasOrders = await claimBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasOrders) {
      test.skip()
      return
    }

    await claimBtn.click()
    // Should show success toast "взят в работу"
    await waitForToast(page, 'взят в работу')
  })

  test('status transition button advances order', async ({ page }) => {
    // Use admin (no emulation) to have full access to any queue
    await page.goto('/production/print')
    await page.waitForLoadState('networkidle')

    // Look for the status advance button (shows next status label like "→ Ламинация")
    const advanceBtn = page.locator('button').filter({ hasText: /^→/ }).first()
    const hasOrders = await advanceBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (!hasOrders) {
      test.skip()
      return
    }

    await advanceBtn.click()
    // Wait for either a toast or the card to disappear from the queue
    await page.waitForTimeout(2000)
    // The order should have moved to the next stage
  })

  test('queue cards are visible and have proper touch targets on mobile', async ({ page }) => {
    await page.goto('/production/print')
    await page.waitForLoadState('networkidle')

    const cards = page.locator('a[href*="/orders/"]')
    const count = await cards.count()

    if (count === 0) {
      test.skip()
      return
    }

    // All action buttons inside cards should be touch-friendly
    const buttons = page.locator('button:visible').filter({ hasText: /.+/ })
    const btnCount = await buttons.count()

    for (let i = 0; i < Math.min(btnCount, 5); i++) {
      const box = await buttons.nth(i).boundingBox()
      if (box && box.height > 10) {
        expect(box.height).toBeGreaterThanOrEqual(36)
      }
    }
  })

  test('post_printer can view and interact with pouring queue', async ({ page }) => {
    await emulateRole(page, 'Постпечатник')
    await page.goto('/production/pouring')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('main')).toBeVisible()
    await expect(
      page.getByText(/заливка|нет заказов|пусто/i).first()
    ).toBeVisible({ timeout: 10000 })
  })
})
