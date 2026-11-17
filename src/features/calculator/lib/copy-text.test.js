import { describe, it, expect } from 'vitest'
import { calculate, DEFAULT_CALC_SETTINGS } from './calc'
import { buildShortText, buildDetailedText, formatInt, formatPrice, formatArea } from './copy-text'

// Шаблоны ТЗ 5.4 (тот же расчёт: 3D стикерпак, голо, 105×148, 2 вида по 100).
const r = calculate({
  product: 'pack', filmGroup: 'holo', widthMm: 105, heightMm: 148,
  views: [100, 100], options: { resin3d: true },
}, DEFAULT_CALC_SETTINGS)

describe('copy-text', () => {
  it('«Скопировать» совпадает с шаблоном', () => {
    expect(buildShortText(r)).toBe('3D стикерпак · 105×148 мм · 200 шт\nИтого: 36 751 ₽')
  })

  it('«Скопировать подробно» совпадает с шаблоном', () => {
    expect(buildDetailedText(r, { material: 'Голографическая плёнка', lamination: null })).toBe([
      'Расчёт стоимости — Контора',
      'Продукция: 3D стикерпак',
      'Материал: Голографическая плёнка',
      'Ламинация: нет',
      'Размер: 105 × 148 мм (155,4 см²)',
      'Тираж: 200 шт (вид 1 — 100 шт, вид 2 — 100 шт)',
      'Цена за 1 шт: 178,8 ₽',
      'Доплаты:',
      '• Дополнительный вид: 1 × 1 000 ₽',
      'Итого: 36 751 ₽',
    ].join('\n'))
  })

  it('опции: процент у срочности, ₽/шт у упаковки; строки только когда есть что перечислить', () => {
    const r2 = calculate({
      product: 'sticker', filmGroup: 'white', widthMm: 100, heightMm: 100, views: [500],
      options: { urgent: true, bag: true, lamination: true, montage: true },
    }, DEFAULT_CALC_SETTINGS)
    const txt = buildDetailedText(r2, { material: 'Белая плёнка', lamination: 'Матовая' })
    expect(txt).toContain('Опции: Срочность +30%, Упаковка в пакетик +3 ₽/шт')
    expect(txt).toContain('Ламинация: Матовая')
    expect(txt).toContain('Монтажная плёнка: да')
    expect(txt).toContain('• Монтажная плёнка: 1 500 ₽')
    expect(txt).toContain('Размер: 100 × 100 мм (100 см²)')

    const plain = buildDetailedText(calculate({
      product: 'sticker', filmGroup: 'white', widthMm: 100, heightMm: 100, views: [500], options: {},
    }, DEFAULT_CALC_SETTINGS), { material: 'Белая плёнка' })
    expect(plain).not.toContain('Опции:')
    expect(plain).not.toContain('Доплаты:')
  })

  it('в тексты не попадают себестоимость и наценка', () => {
    const both = buildShortText(r) + buildDetailedText(r, { material: 'X' })
    expect(both).not.toMatch(/себестоим|наценк|×\d,\d/i)
  })

  it('форматирование чисел', () => {
    expect(formatInt(172302)).toBe('172 302')
    expect(formatInt(999)).toBe('999')
    expect(formatPrice(330.60346)).toBe('330,6 ₽')
    expect(formatPrice(21.3)).toBe('21,3 ₽')
    expect(formatArea(155.4)).toBe('155,4')
    expect(formatArea(100)).toBe('100')
  })
})
