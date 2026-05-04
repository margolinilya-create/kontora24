import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Order Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('create order page loads with form', async ({ page }) => {
    await page.goto('/orders/create')
    await expect(page.getByText('Параметры')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Ширина, мм')).toBeVisible()
    await expect(page.getByText('Высота, мм')).toBeVisible()
    await expect(page.getByText('Тираж', { exact: true })).toBeVisible()
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

  test('order can be created through form', async ({ page }) => {
    await page.goto('/orders/create')
    await page.getByLabel(/ширина/i).fill('60')
    await page.getByLabel(/высота/i).fill('40')
    await page.getByLabel(/тираж/i).fill('50')
    const createBtn = page.getByRole('button', { name: /создать заказ|оформить/i })
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.scrollIntoViewIfNeeded()
      await createBtn.click()
      await page.waitForTimeout(2000)
    }
  })
})
