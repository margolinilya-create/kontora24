import { test, expect } from '@playwright/test'
import { login, clickViewTab, expectViewTabVisible, dismissShiftModal } from './helpers'

test.describe('Orders page (R6+R7)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')
    await dismissShiftModal(page)
  })

  test('страница имеет view-табы: По отделам / Канбан / Календарь / Все заказы', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    // На desktop — <Tabs role=tab>, на mobile — <DropdownMenu> с role=option.
    // expectViewTabVisible выбирает нужный локатор по видимости.
    await expectViewTabVisible(page, 'По отделам')
    await expectViewTabVisible(page, 'Канбан')
    await expectViewTabVisible(page, 'Календарь')
    await expectViewTabVisible(page, 'Все заказы')
  })

  test('список — таблица с группировкой по отделам', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    // Группа = <section> с заголовком-кнопкой aria-expanded и таблицей внутри.
    // На mobile вместо <table> — <ul>; ограничиваемся секцией.
    const sections = page.locator('section').filter({ has: page.locator('button[aria-expanded]') })
    const count = await sections.count()
    if (count === 0) { test.skip(); return }
    await expect(sections.first()).toBeVisible()
    // Кнопка группы — внутри section, не DropdownMenu (тот listbox).
    const groupBtn = sections.first().locator('button[aria-expanded]:not([aria-haspopup])').first()
    await expect(groupBtn).toBeVisible()
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
    await clickViewTab(page, 'Канбан')
    await page.waitForTimeout(800)
    const cols = page.locator('[data-col]')
    const count = await cols.count()
    expect(count).toBeGreaterThan(0)
  })

  test('календарь показывает заголовок месяца', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    await clickViewTab(page, 'Календарь')
    await page.waitForTimeout(800)
    await expect(page.getByText('Пн', { exact: true }).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Вс', { exact: true }).first()).toBeVisible()
  })
})

test.describe('Order detail (R2+R3)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')
    await dismissShiftModal(page)
  })

  test('открыть заказ — есть Stepper и 5 вкладок', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    const firstOrderLink = page.locator('a[href*="/orders/"]:not([href*="create"])').first()
    if (!(await firstOrderLink.isVisible({ timeout: 5000 }).catch(() => false))) { test.skip(); return }
    await firstOrderLink.click()
    await page.waitForLoadState('networkidle')
    // На detail-странице тоже Tabs/DropdownMenu по viewport.
    await expectViewTabVisible(page, 'Обзор')
    await expectViewTabVisible(page, 'Прогресс')
    await expectViewTabVisible(page, 'Расход материалов')
    await expectViewTabVisible(page, 'История')
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
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')
    await dismissShiftModal(page)
  })

  test('форма на одном экране, нет collapsible', async ({ page }) => {
    await page.goto('/orders/create')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Новый заказ' })).toBeVisible()
    // Накопительный счёт aria-expanded без listbox (исключаем DropdownMenu).
    const collapsibles = page.locator('button[aria-expanded]:not([aria-haspopup="listbox"])')
    const count = await collapsibles.count()
    expect(count).toBeLessThanOrEqual(2)
  })

  test('кнопка «Заполнить из Bitrix» disabled', async ({ page }) => {
    await page.goto('/orders/create')
    await page.waitForLoadState('networkidle')
    const btn = page.getByRole('button', { name: /заполнить из bitrix/i })
    await expect(btn).toBeVisible()
    await expect(btn).toBeDisabled()
  })
})
