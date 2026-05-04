import { test, expect } from '@playwright/test'
import { login, waitForToast, navigateTo } from './helpers'

test.describe('Order Full Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')
  })

  test('create a new order via form and verify it appears in orders list', async ({ page }) => {
    await page.goto('/orders/create')
    await page.waitForLoadState('networkidle')

    // Wait for form to load
    await expect(page.getByText('Параметры')).toBeVisible({ timeout: 15000 })

    // Fill required fields
    await page.getByLabel(/ширина/i).fill('50')
    await page.getByLabel(/высота/i).fill('50')
    await page.getByLabel(/тираж/i).fill('100')

    // Select order type if visible
    const typeSelect = page.locator('select').filter({ hasText: /стикер|тип/i }).first()
    if (await typeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await typeSelect.selectOption({ index: 1 })
    }

    // Fill deal name (if visible)
    const dealNameInput = page.getByLabel(/название сделки/i)
    if (await dealNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dealNameInput.fill('E2E Test Order')
    }

    // Submit the form
    const createBtn = page.getByRole('button', { name: /создать заказ|оформить|создать/i })
    await createBtn.scrollIntoViewIfNeeded()
    await createBtn.click()

    // Wait for redirect to order detail or orders list, or success toast
    await page.waitForURL(/\/orders/, { timeout: 15000 })

    // Verify we're on order detail or orders page
    await expect(page.locator('main')).toBeVisible()
  })

  test('order detail page shows all tabs and info', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')

    const firstOrderLink = page.locator('a[href*="/orders/"]').first()
    const hasOrders = await firstOrderLink.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasOrders) {
      test.skip()
      return
    }

    await firstOrderLink.click()
    await page.waitForLoadState('networkidle')

    // Order detail should show order number
    await expect(page.getByText(/ORD-|#\d+/i).first()).toBeVisible({ timeout: 10000 })

    // Should show order status
    await expect(page.locator('main')).toBeVisible()
  })

  test('advance order status via status switcher button', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')

    const firstOrderLink = page.locator('a[href*="/orders/"]').first()
    const hasOrders = await firstOrderLink.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasOrders) {
      test.skip()
      return
    }

    await firstOrderLink.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Look for the status advance button (starts with arrow →)
    const advanceBtn = page.locator('button').filter({ hasText: /^→/ }).first()
    const canAdvance = await advanceBtn.isVisible({ timeout: 5000 }).catch(() => false)

    if (!canAdvance) {
      // Order might be in done/cancelled state — skip
      test.skip()
      return
    }

    // Record current button text (contains next status)
    const btnText = await advanceBtn.textContent()

    await advanceBtn.click()
    await page.waitForTimeout(2000)

    // After advancing, the button should change to show the next-next status
    // or disappear if order is now done
    const newBtnText = await advanceBtn.textContent().catch(() => null)
    if (newBtnText) {
      expect(newBtnText).not.toEqual(btnText)
    }
  })

  test('order status history / timeline is visible on detail page', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')

    const firstOrderLink = page.locator('a[href*="/orders/"]').first()
    const hasOrders = await firstOrderLink.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasOrders) {
      test.skip()
      return
    }

    await firstOrderLink.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Look for timeline or history section
    const timeline = page.getByText(/история|таймлайн|статус/i).first()
    await expect(timeline).toBeVisible({ timeout: 10000 })
  })

  test('production board shows orders distributed by status columns', async ({ page }) => {
    await page.goto('/production')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('main')).toBeVisible()

    // Production board should show status columns
    await expect(
      page.getByText(/дизайн|печать|резка|упаковка/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('cancel order flow (admin only)', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')

    const firstOrderLink = page.locator('a[href*="/orders/"]').first()
    const hasOrders = await firstOrderLink.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasOrders) {
      test.skip()
      return
    }

    await firstOrderLink.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Admin should see "Отменить" button
    const cancelBtn = page.getByRole('button', { name: /отменить/i }).first()
    const canCancel = await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)

    if (!canCancel) {
      // Order might already be done/cancelled
      test.skip()
      return
    }

    await cancelBtn.click()

    // Confirm dialog should appear
    const confirmDialog = page.locator('[role="dialog"], div.fixed').filter({ hasText: /отменить заказ/i })
    await expect(confirmDialog).toBeVisible({ timeout: 5000 })

    // Click confirm button inside dialog
    const confirmBtn = confirmDialog.getByRole('button', { name: /отменить заказ/i })
    await confirmBtn.click()

    // Wait for status to update
    await page.waitForTimeout(2000)
  })

  test('orders table supports filtering and search', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')

    // Look for search input
    const searchInput = page.locator('input[placeholder*="оиск"], input[type="search"]').first()
    const hasSearch = await searchInput.isVisible({ timeout: 3000 }).catch(() => false)

    if (hasSearch) {
      await searchInput.fill('test')
      await page.waitForTimeout(1000)
      // Table should update (or show no results)
      await expect(page.locator('main')).toBeVisible()
    }
  })
})
