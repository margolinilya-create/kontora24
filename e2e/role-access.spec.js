import { test, expect } from '@playwright/test'
import { login, ensureSidebarOpen, expandSidebarGroup, emulateRole } from './helpers'

// admin (mib@pnhd.ru) с эмуляцией ролей через RoleSwitcher.
// Главная (/) для не-менеджеров редиректит на /cabinet (см. HomeRoute в routes.jsx,
// «по аудиту R5 от 8.05»). В сайдбаре «Главная» и «Аналитика» скрыты у рабочих,
// «Заказы» доступен всем ролям. Импersonation персистится в sessionStorage —
// переживает reload, поэтому page.goto() из тестов больше не сбрасывает роль.

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

  test('worker (post_printer) при заходе на «/» попадает в кабинет', async ({ page }) => {
    await emulateRole(page, 'Постпечатник')
    await page.goto('/')
    // HomeRoute редиректит не-менеджера на /cabinet (R5 8.05)
    await page.waitForURL(/\/cabinet$/, { timeout: 10000 })
    await expect(page).toHaveURL(/\/cabinet$/)
  })

  test('worker видит Заказы в сайдбаре, не видит Главную/Аналитику', async ({ page }) => {
    await emulateRole(page, 'Печатник')
    await page.waitForTimeout(800)
    await ensureSidebarOpen(page)
    // Группы collapsed по умолчанию — раскрываем "Управление" и "Ресурсы"
    await expandSidebarGroup(page, 'Управление')
    const sidebar = page.locator('aside')
    await expect(sidebar.getByRole('link', { name: 'Заказы' })).toBeVisible()
    // У рабочих в группе Управление главной нет вообще
    await expect(sidebar.getByRole('link', { name: 'Главная', exact: true })).not.toBeVisible()
    await expandSidebarGroup(page, 'Ресурсы')
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
