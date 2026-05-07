// Visual smoke screenshots — для ручной проверки UI после R1—R9.
// Не запускается в обычном `npm run test:e2e` (отдельный grep), сохраняет
// PNG в /tmp/kontora-screens/.
import { test } from '@playwright/test'
import { login } from './helpers'
import fs from 'node:fs'

const OUT = '/tmp/kontora-screens'
fs.mkdirSync(OUT, { recursive: true })

async function shot(page, name) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
}

test.describe('@screens visual smoke', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('all key screens', async ({ page }) => {
    await login(page)
    await page.waitForLoadState('networkidle')

    // Главная-Обзор
    await page.goto('/')
    await shot(page, '01-home-overview')

    // Главная-Статистика (Tab)
    await page.getByRole('tab', { name: 'Статистика производства' }).click().catch(() => {})
    await shot(page, '02-home-stats')

    // Заказы — список
    await page.goto('/orders')
    await shot(page, '03-orders-list')

    // Заказы — канбан
    await page.getByRole('tab', { name: 'Канбан' }).click().catch(() => {})
    await shot(page, '04-orders-kanban')

    // Заказы — календарь
    await page.getByRole('tab', { name: 'Календарь' }).click().catch(() => {})
    await shot(page, '05-orders-calendar')

    // Открыть тестовый заказ #30 (мы создали через SQL)
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
    const card = page.locator('a[href^="/orders/"]:not([href*="create"])').first()
    if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
      await card.click()
      await shot(page, '06-order-detail-overview')
      await page.getByRole('tab', { name: 'Прогресс' }).click().catch(() => {})
      await shot(page, '07-order-detail-progress')
      await page.getByRole('tab', { name: 'Расход материалов' }).click().catch(() => {})
      await shot(page, '08-order-detail-reports')
      await page.getByRole('tab', { name: 'Финансы' }).click().catch(() => {})
      await shot(page, '09-order-detail-finance')
    }

    // Создание заказа
    await page.goto('/orders/create')
    await shot(page, '10-create-order')

    // Личный кабинет
    await page.goto('/cabinet')
    await shot(page, '11-cabinet')

    // Склад
    await page.goto('/warehouse')
    await shot(page, '12-warehouse')

    // Аналитика
    await page.goto('/analytics')
    await shot(page, '13-analytics')
  })
})
