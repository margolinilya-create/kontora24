import { test, expect } from '@playwright/test'
import { login, ensureSidebarOpen, expandSidebarGroup, emulateRole } from './helpers'

// R12.0 — фундамент планировщика. Проверяем что:
//   1. admin видит пункт «Планирование (бета)» в группе «Производство»
//      и попадает на страницу с шильдиком БЕТА.
//   2. printer (эмуляция) пункта в меню не видит и при прямом заходе
//      AuthGuard редиректит его на главную (а HomeRoute далее → /cabinet).

test.describe('R12.0 Планировщик — доступ', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)
  })

  test('admin видит пункт «Планирование (бета)» в сайдбаре', async ({ page }) => {
    await ensureSidebarOpen(page)
    await expandSidebarGroup(page, 'Производство')
    const sidebar = page.locator('aside:visible').first()
    await expect(sidebar.getByRole('link', { name: /планирование/i })).toBeVisible()
  })

  test('admin открывает /production/plan и видит заголовок + шильдик БЕТА', async ({ page }) => {
    await page.goto('/production/plan')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /планирование производства/i })).toBeVisible()
    await expect(page.getByText(/^бета$/i)).toBeVisible()
  })

  test('printer не видит пункт «Планирование» и редиректится с /production/plan', async ({ page }) => {
    await emulateRole(page, 'Печатник')
    await page.waitForTimeout(800)
    await ensureSidebarOpen(page)
    await expandSidebarGroup(page, 'Производство')
    const sidebar = page.locator('aside:visible').first()
    await expect(sidebar.getByRole('link', { name: /планирование/i })).not.toBeVisible()

    await page.goto('/production/plan')
    // AuthGuard → Navigate to "/" → HomeRoute редиректит не-менеджера в /cabinet
    await page.waitForURL(/\/cabinet$/, { timeout: 10000 })
    await expect(page).toHaveURL(/\/cabinet$/)
  })
})
