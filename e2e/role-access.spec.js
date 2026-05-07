import { test, expect } from '@playwright/test'
import { login } from './helpers'

// admin (mib@pnhd.ru) с эмуляцией ролей через RoleSwitcher.
// По R8: рабочие сразу попадают на /orders (HomeRoute), главная и аналитика
// скрыты в сайдбаре, /orders открыт всем ролям.

async function emulateRole(page, roleName) {
  const switchBtn = page.locator('button[aria-label="Переключение роли"]')
  await switchBtn.click()
  await page.getByText(roleName, { exact: true }).click()
  await page.waitForTimeout(500)
}

test.describe('Role-Based Access Control (R8)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  })

  test('admin sees finance section on order detail', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')

    const firstOrderLink = page.locator('a[href*="/orders/"]:not([href*="/orders/create"])').first()
    const hasOrders = await firstOrderLink.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasOrders) { test.skip(); return }

    await firstOrderLink.click()
    await page.waitForLoadState('networkidle')
    // Финансы — отдельная вкладка только для admin/manager
    await expect(page.getByRole('tab', { name: 'Финансы' }).or(page.getByText('Финансы').first())).toBeVisible({ timeout: 10000 })
  })

  test('printer (emulated) does NOT see Финансы tab', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    const firstOrderLink = page.locator('a[href*="/orders/"]:not([href*="/orders/create"])').first()
    const hasOrders = await firstOrderLink.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasOrders) { test.skip(); return }

    const href = await firstOrderLink.getAttribute('href')
    await emulateRole(page, 'Печатник')
    await page.goto(href)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    // У печатника во вкладках нет «Финансы»
    const financeTab = page.getByRole('tab', { name: 'Финансы' })
    await expect(financeTab).not.toBeVisible()
  })

  test('worker (post_printer) попадает на /orders, не на главную', async ({ page }) => {
    await emulateRole(page, 'Постпечатник')
    await page.goto('/')
    // HomeRoute редиректит worker на /orders
    await page.waitForURL(/\/orders$/, { timeout: 10000 })
    await expect(page).toHaveURL(/\/orders$/)
  })

  test('worker видит Заказы в сайдбаре, не видит Главную/Аналитику', async ({ page }) => {
    await emulateRole(page, 'Печатник')
    await page.waitForTimeout(800)
    const sidebar = page.locator('aside')
    await expect(sidebar.getByRole('link', { name: 'Заказы' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Главная' })).not.toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Аналитика' })).not.toBeVisible()
  })

  test('worker не видит «+ Новый заказ» на странице заказов', async ({ page }) => {
    await emulateRole(page, 'Постпечатник')
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    const createBtn = page.getByRole('link', { name: /новый заказ/i })
    await expect(createBtn).not.toBeVisible()
  })

  test('admin видит «+ Новый заказ»', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('link', { name: /новый заказ/i })).toBeVisible({ timeout: 5000 })
  })
})
