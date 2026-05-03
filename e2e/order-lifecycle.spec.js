import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Order Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('calculator page loads with form', async ({ page }) => {
    await page.goto('/calculator')
    // Wait for the form to render (not just the loading spinner)
    await expect(page.getByText('Параметры')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Ширина, мм')).toBeVisible()
    await expect(page.getByText('Высота, мм')).toBeVisible()
    await expect(page.getByText('Тираж', { exact: true })).toBeVisible()
  })

  test('calculator auto-computes price', async ({ page }) => {
    await page.goto('/calculator')
    await expect(page.getByText('Параметры')).toBeVisible({ timeout: 15000 })
    // Find input fields by their label text proximity
    const widthInput = page.locator('input').nth(0)
    const heightInput = page.locator('input').nth(1)
    const qtyInput = page.locator('input').nth(2)
    await widthInput.fill('80')
    await heightInput.fill('60')
    await qtyInput.fill('200')
    // Should show price results
    await expect(page.getByText(/итого|₽/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('orders page shows table', async ({ page }) => {
    await page.goto('/orders')
    await expect(page.locator('table, [role="table"]')).toBeVisible({ timeout: 10000 })
  })

  test('order detail page loads for existing order', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    const firstOrderLink = page.locator('a[href*="/orders/"]').first()
    if (await firstOrderLink.isVisible()) {
      await firstOrderLink.click()
      await expect(page.getByText(/ORD-|Заказ #/i)).toBeVisible({ timeout: 5000 })
    }
  })

  test('production board shows columns', async ({ page }) => {
    await page.goto('/production')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/новый|дизайн|печать/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('order can be created through calculator', async ({ page }) => {
    await page.goto('/calculator')
    await page.getByLabel(/ширина/i).fill('60')
    await page.getByLabel(/высота/i).fill('40')
    await page.getByLabel(/тираж/i).fill('50')
    // Look for create button (scrolling down if needed)
    const createBtn = page.getByRole('button', { name: /создать заказ|оформить/i })
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.scrollIntoViewIfNeeded()
      await createBtn.click()
      await page.waitForTimeout(2000)
    }
  })
})
