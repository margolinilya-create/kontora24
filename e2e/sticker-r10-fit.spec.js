// R10.1 (фидбек 26.05): проверить что номер заказа в стикере «На выдачу»
// не обрезается. Менеджер прислал скрин с обрезанным 4-значным номером 2673
// — Modulord широкий, fontSize 60pt не помещался в ~187px доступной ширины.
// Auto-fit через useLayoutEffect + document.fonts.ready должен подогнать.

import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('R10.1 Sticker auto-fit', () => {
  test('номер заказа влезает по ширине (production + delivery)', async ({ page }) => {
    await login(page)

    // Берём заказ из скрина менеджера — qty=2673, custom_number='312',
    // обрезанный номер на стикере. Идём прямо на него.
    await page.goto('/orders/0c193b12-2378-4efb-9aa7-02ea631b48bb')

    // Ждём загрузки страницы заказа + кнопок печати.
    await page.waitForURL(/\/orders\/[a-f0-9-]+/)
    await page.waitForSelector('button:has-text("На выдачу")')

    for (const type of ['delivery', 'production']) {
      const label = type === 'delivery' ? 'На выдачу' : 'На бокс'
      await page.click(`button:has-text("${label}")`)
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

      // Ждём загрузки шрифтов (Modulord) — критично для авто-fit.
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(300)

      // Проверка: scrollWidth номера <= clientWidth родителя.
      const result = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]')
        if (!dialog) return { error: 'no dialog' }
        // Корень стикера — div с offsetWidth близким к 340px (STICKER_W = 120*2.833 ≈ 339.96).
        const root = Array.from(dialog.querySelectorAll('div')).find(
          (d) => Math.abs(d.offsetWidth - 340) < 2 && Math.abs(d.offsetHeight - 213) < 2,
        )
        if (!root) return { error: 'no sticker root' }
        // Номер — div с inline fontFamily Modulord.
        const numEl = Array.from(root.querySelectorAll('div')).find((d) =>
          (d.style.fontFamily || '').includes('Modulord'),
        )
        if (!numEl) return { error: 'no number el' }
        const parent = numEl.parentElement
        return {
          numberText: numEl.textContent,
          scrollWidth: numEl.scrollWidth,
          clientWidth: parent.clientWidth,
          fontSize: numEl.style.fontSize,
          stickerW: root.offsetWidth,
          stickerH: root.offsetHeight,
        }
      })

      console.log(`[${type}]`, result)
      expect(result.error).toBeFalsy()
      // Главная проверка: текст должен вписываться в доступную ширину.
      expect(result.scrollWidth, `sticker=${type} number=${result.numberText} fontSize=${result.fontSize}`)
        .toBeLessThanOrEqual(result.clientWidth)

      // Закрываем модал перед следующей итерацией.
      await page.keyboard.press('Escape')
      await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 5000 })
    }
  })
})
