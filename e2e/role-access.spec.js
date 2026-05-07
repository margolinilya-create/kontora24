import { test, expect } from '@playwright/test'
import { login } from './helpers'

// Tests use admin account (mib@pnhd.ru) with role emulation via RoleSwitcher.
// AuthGuard redirects to "/" when role lacks access.

async function emulateRole(page, roleName) {
  const switchBtn = page.locator('button[aria-label="Переключение роли"]')
  await switchBtn.click()
  await page.getByText(roleName, { exact: true }).click()
  await page.waitForTimeout(500)
}

// eslint-disable-next-line no-unused-vars -- kept for future tests that need to clear role emulation
async function resetEmulation(page) {
  const banner = page.locator('[class*="amber"], [class*="warning"]').filter({ hasText: /эмуля|роль/i })
  const resetBtn = banner.getByRole('button').first()
  if (await resetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await resetBtn.click()
    await page.waitForTimeout(500)
  }
}

test.describe('Role-Based Access Control', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  })

  test('admin sees financial fields on order detail page', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')

    // Click on first order to open detail
    const firstOrderLink = page.locator('a[href*="/orders/"]').first()
    const hasOrders = await firstOrderLink.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasOrders) {
      test.skip()
      return
    }

    await firstOrderLink.click()
    await page.waitForLoadState('networkidle')

    // Admin should see finance section with price
    await expect(
      page.getByText(/финансы|итого|стоимость/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('printer (emulated) does NOT see price fields on order detail', async ({ page }) => {
    // First navigate to an order page while still admin
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')

    const firstOrderLink = page.locator('a[href*="/orders/"]').first()
    const hasOrders = await firstOrderLink.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasOrders) {
      test.skip()
      return
    }

    // Get the order URL
    const href = await firstOrderLink.getAttribute('href')

    // Now emulate printer role
    await emulateRole(page, 'Печатник')

    // Navigate to the order detail (order detail is accessible to all roles)
    await page.goto(href)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Printer should NOT see finance section
    const financeSection = page.getByText('Финансы', { exact: true })
    await expect(financeSection).not.toBeVisible()
  })

  test('designer can access /production/design', async ({ page }) => {
    await emulateRole(page, 'Дизайнер')
    await page.goto('/production/design')
    await page.waitForLoadState('networkidle')

    // Should NOT be redirected — page loads with queue content
    await expect(page).toHaveURL(/\/production\/design/)
    await expect(page.locator('main')).toBeVisible()
    await expect(
      page.getByText(/очередь дизайна|дизайн|нет заказов/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('designer cannot access /production/cutting (redirected to /)', async ({ page }) => {
    await emulateRole(page, 'Дизайнер')
    await page.goto('/production/cutting')
    await page.waitForURL('/', { timeout: 10000 })
    // Redirected to home page
    await expect(page).toHaveURL('/')
  })

  test('post_printer cannot access /orders page (redirected to /)', async ({ page }) => {
    await emulateRole(page, 'Постпечатник')
    await page.goto('/orders')
    await page.waitForURL('/', { timeout: 10000 })
    await expect(page).toHaveURL('/')
  })

  test('post_printer can access /production/pouring', async ({ page }) => {
    await emulateRole(page, 'Постпечатник')
    await page.goto('/production/pouring')
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/\/production\/pouring/)
    await expect(page.locator('main')).toBeVisible()
  })

  test('printer cannot access /production/pouring (redirected to /)', async ({ page }) => {
    await emulateRole(page, 'Печатник')
    await page.goto('/production/pouring')
    await page.waitForURL('/', { timeout: 10000 })
    await expect(page).toHaveURL('/')
  })

  test('printer can access /production/print', async ({ page }) => {
    await emulateRole(page, 'Печатник')
    await page.goto('/production/print')
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/\/production\/print/)
    await expect(page.locator('main')).toBeVisible()
  })

  test('admin sees all sidebar navigation items', async ({ page }) => {
    const sidebar = page.locator('aside')
    await expect(sidebar.getByRole('link', { name: 'Заказы' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Производство' })).toBeVisible()
  })

  test('designer (emulated) does not see Заказы in sidebar', async ({ page }) => {
    await emulateRole(page, 'Дизайнер')
    await page.waitForTimeout(500)

    const sidebar = page.locator('aside')
    // Designer should not see "Заказы" link since /orders requires admin/manager
    const ordersLink = sidebar.getByRole('link', { name: 'Заказы' })
    await expect(ordersLink).not.toBeVisible()
  })
})
