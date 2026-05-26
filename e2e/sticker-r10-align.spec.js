// R10.2 (фидбек 27.05): проверить top-выравнивание номера с правой колонкой.
import { test, expect } from '@playwright/test'
import { login } from './helpers'

test('R10.2 номер выровнен по верху с правой колонкой', async ({ page }) => {
  await login(page)
  await page.goto('/orders/0c193b12-2378-4efb-9aa7-02ea631b48bb')
  await page.waitForSelector('button:has-text("На выдачу")')

  for (const type of ['delivery', 'production']) {
    const label = type === 'delivery' ? 'На выдачу' : 'На бокс'
    await page.click(`button:has-text("${label}")`)
    await page.waitForSelector('[role="dialog"]')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(400)

    // Скриншот превью.
    const dialog = page.locator('[role="dialog"]')
    await dialog.screenshot({ path: `test-results/r10-align-${type}.png` })

    // Меряем visible top глифа = box.top + (fontBoundingBoxAscent - actualBoundingBoxAscent)
    // через Canvas TextMetrics — это единственный точный способ из DOM.
    const result = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      const root = Array.from(dialog.querySelectorAll('div')).find(
        (d) => Math.abs(d.offsetWidth - 340) < 2 && Math.abs(d.offsetHeight - 213) < 2,
      )
      const numEl = Array.from(root.querySelectorAll('div')).find((d) =>
        (d.style.fontFamily || '').includes('Modulord'),
      )
      const rightCol = Array.from(root.querySelectorAll('div')).find((d) =>
        d.style.width && d.style.flexShrink === '0',
      )
      if (!numEl || !rightCol) return { error: 'els not found' }
      const labelEl = rightCol.querySelector('div div') // первый row.label

      function visibleTop(el) {
        const cs = getComputedStyle(el)
        const c = document.createElement('canvas')
        const ctx = c.getContext('2d')
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        const m = ctx.measureText(el.textContent || '0')
        const bearing = Math.max(0, m.fontBoundingBoxAscent - m.actualBoundingBoxAscent)
        return el.getBoundingClientRect().top + bearing
      }

      const numGlyphTop = visibleTop(numEl)
      const labelGlyphTop = visibleTop(labelEl)
      return {
        numGlyphTop,
        labelGlyphTop,
        delta: numGlyphTop - labelGlyphTop,
        numBoxTop: numEl.getBoundingClientRect().top,
        labelBoxTop: labelEl.getBoundingClientRect().top,
      }
    })

    console.log(`[${type}]`, result)
    expect(result.error).toBeFalsy()
    // Допуск ±5px — учитывая разность шрифтов (Modulord vs Guidy uppercase).
    expect(Math.abs(result.delta), `${type}: glyphs numTop=${result.numGlyphTop} labelTop=${result.labelGlyphTop}`)
      .toBeLessThan(6)

    await page.keyboard.press('Escape')
    await page.waitForSelector('[role="dialog"]', { state: 'detached' })
  }
})
