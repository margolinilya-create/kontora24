// R27.0 (ТЗ №2): номер заказа на образце в PNG/PDF/печати (html2canvas) не
// должен съезжать вниз под тёмную капсулу даты. Открываем dev-only стенд
// /dev/sample-proof (без логина), снимаем образец тем же renderCanvas, что и
// PrintPreviewModal, и проверяем: тёмные пиксели цифр лежат внутри капсулы
// номера, выше зоны нахлёста капсулы даты, и центрированы в капсуле.
// Safari/iPhone — ручная проверка: Chromium не воспроизводит смещение Safari.
import { test, expect } from '@playwright/test'

const CASES = [
  { name: '#7', query: 'number=7' },
  { name: '#302', query: 'number=302' },
  { name: '#12345', query: 'number=12345' },
  { name: '8 знаков', query: 'custom=12345678' },
  { name: 'длинный custom_number', query: `custom=${encodeURIComponent('ПИНХЕД-2026-СТУДИЯ-000123')}` },
]

// PW_CHROMIUM_PATH — свой бинарь Chromium, если версия браузеров Playwright
// в окружении не совпадает с установленным пакетом.
if (process.env.PW_CHROMIUM_PATH) {
  test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } })
}

test.skip(({ browserName }) => browserName !== 'chromium', 'Пиксельная проверка — только Chromium')

for (const c of CASES) {
  test(`образец: номер ${c.name} внутри капсулы в html2canvas`, async ({ page }, testInfo) => {
    await page.goto(`/dev/sample-proof?${c.query}`)
    // Номер и дата нарисованы на canvas и вставлены картинками.
    const numImg = page.getByTestId('sample-number-img')
    await expect(numImg).toBeVisible()
    await expect(page.getByTestId('sample-date-img')).toBeVisible()
    await page.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll('img'))
      return imgs.every((i) => i.complete) && !!window.__sampleProof
    })

    const result = await page.evaluate(async () => {
      const r = await window.__sampleProof.render({ scale: 2 })
      const img = new Image()
      img.src = r.png
      await img.decode()
      const cv = document.createElement('canvas')
      cv.width = r.width
      cv.height = r.height
      const ctx = cv.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const s = r.scale
      const cap = r.numberCapsule
      const date = r.dateCapsule
      // Зона поиска: по ширине капсулы номера, по высоте — от чуть выше капсулы
      // до низа капсулы даты (если цифры «уехали», они окажутся здесь).
      const x0 = Math.round(cap.x * s)
      const x1 = Math.round((cap.x + cap.width) * s)
      const y0 = Math.max(0, Math.round((cap.y - 20) * s))
      const y1 = Math.round((date.y + date.height + 20) * s)
      const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data
      let count = 0
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (let y = 0; y < y1 - y0; y++) {
        for (let x = 0; x < x1 - x0; x++) {
          const i = (y * (x1 - x0) + x) * 4
          // Чёрные цифры (#000). Серое лого и фон даты (#5C5C5C) — светлее.
          if (data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40) {
            count++
            const px = (x + x0) / s
            const py = (y + y0) / s
            if (px < minX) minX = px
            if (px > maxX) maxX = px
            if (py < minY) minY = py
            if (py > maxY) maxY = py
          }
        }
      }
      return { count, minX, maxX, minY, maxY, cap, date, png: r.png, width: r.width, height: r.height }
    })

    await testInfo.attach('sample-proof.png', {
      body: Buffer.from(result.png.split(',')[1], 'base64'),
      contentType: 'image/png',
    })
    const { png: _png, ...summary } = result
    console.log(`[${c.name}]`, JSON.stringify(summary))

    const { cap, date } = result
    // Экспорт 1748×2480 (A5 300 DPI).
    expect(result.width).toBe(1748)
    expect(result.height).toBe(2480)
    // Капсула не шире 760px.
    expect(cap.width).toBeLessThanOrEqual(760)
    // Цифры нарисованы.
    expect(result.count).toBeGreaterThan(100)
    // Все тёмные пиксели — внутри капсулы номера по горизонтали и вертикали…
    expect(result.minX).toBeGreaterThanOrEqual(cap.x)
    expect(result.maxX).toBeLessThanOrEqual(cap.x + cap.width)
    expect(result.minY).toBeGreaterThanOrEqual(cap.y)
    // …и выше зоны нахлёста капсулы даты (цифры не перекрыты).
    expect(result.maxY).toBeLessThan(date.y)
    // Центр цифр совпадает с центром капсулы (±5px).
    const cy = (result.minY + result.maxY) / 2
    const cx = (result.minX + result.maxX) / 2
    expect(Math.abs(cy - (cap.y + cap.height / 2))).toBeLessThanOrEqual(5)
    expect(Math.abs(cx - (cap.x + cap.width / 2))).toBeLessThanOrEqual(5)
  })
}
