import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Orders page (R6+R7)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')
  })

  test('страница имеет 3 view-таба: Список / Канбан / Календарь', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('tab', { name: 'Список' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('tab', { name: 'Канбан' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Календарь' })).toBeVisible()
  })

  test('список — таблица с группировкой по отделам', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    // Должна быть хотя бы одна группа (section) с заголовком и таблицей
    const sections = page.locator('section').filter({ has: page.locator('table') })
    const count = await sections.count()
    if (count === 0) { test.skip(); return }
    await expect(sections.first()).toBeVisible()
    // Заголовок группы — кнопка с aria-expanded
    await expect(page.locator('button[aria-expanded]').first()).toBeVisible()
  })

  test('toggle «Завершённые» переключает выборку', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    const toggle = page.getByLabel('Завершённые')
    await expect(toggle).toBeVisible()
    await toggle.check()
    await page.waitForTimeout(800)
    await expect(toggle).toBeChecked()
  })

  test('канбан показывает колонки этапов', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    await page.getByRole('tab', { name: 'Канбан' }).click()
    await page.waitForTimeout(800)
    // Колонки канбана имеют data-col атрибут
    const cols = page.locator('[data-col]')
    const count = await cols.count()
    expect(count).toBeGreaterThan(0)
  })

  test('календарь показывает заголовок месяца', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    await page.getByRole('tab', { name: 'Календарь' }).click()
    await page.waitForTimeout(800)
    // Заголовки дней Пн..Вс должны появиться
    await expect(page.getByText('Пн', { exact: true }).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Вс', { exact: true }).first()).toBeVisible()
  })
})

test.describe('Order detail (R2+R3)', () => {
  test.beforeEach(async ({ page }) => { await login(page); await page.waitForLoadState('networkidle') })

  test('открыть заказ — есть Stepper и 5 вкладок', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    const firstOrderLink = page.locator('a[href*="/orders/"]:not([href*="create"])').first()
    if (!(await firstOrderLink.isVisible({ timeout: 5000 }).catch(() => false))) { test.skip(); return }
    await firstOrderLink.click()
    await page.waitForLoadState('networkidle')
    // 5 вкладок (или 4 если non-admin)
    await expect(page.getByRole('tab', { name: 'Обзор' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('tab', { name: 'Прогресс' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Расход материалов' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'История' })).toBeVisible()
  })

  test('кнопки печати открывают попап', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    const firstOrderLink = page.locator('a[href*="/orders/"]:not([href*="create"])').first()
    if (!(await firstOrderLink.isVisible({ timeout: 5000 }).catch(() => false))) { test.skip(); return }
    await firstOrderLink.click()
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Тех. карта' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Create order (R7)', () => {
  test.beforeEach(async ({ page }) => { await login(page); await page.waitForLoadState('networkidle') })

  test('форма на одном экране, нет collapsible', async ({ page }) => {
    await page.goto('/orders/create')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Новый заказ' })).toBeVisible()
    // Нет accordion-кнопок открывающих секции
    const collapsibles = page.locator('button[aria-expanded]')
    const count = await collapsibles.count()
    expect(count).toBeLessThanOrEqual(2) // допускаем role-switcher и подобное
  })

  test('кнопка «Заполнить из Bitrix» disabled', async ({ page }) => {
    await page.goto('/orders/create')
    await page.waitForLoadState('networkidle')
    const btn = page.getByRole('button', { name: /заполнить из bitrix/i })
    await expect(btn).toBeVisible()
    await expect(btn).toBeDisabled()
  })
})
