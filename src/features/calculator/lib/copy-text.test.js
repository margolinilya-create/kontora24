import { describe, it, expect } from 'vitest'
import { calculate, DEFAULT_CALC_SETTINGS } from './calc'
import {
  buildShortText, buildDetailedText, buildOptionLines, formatInt, formatPrice, formatArea, formatHours,
  TEXT_RULE,
} from './copy-text'

const S = DEFAULT_CALC_SETTINGS

// Шаблоны ТЗ 5.4 (тот же расчёт: 3D стикерпак, голо, 105×148, 2 вида по 100).
const r = calculate({
  product: 'pack', filmGroup: 'holo', widthMm: 105, heightMm: 148,
  views: [100, 100], options: { resin3d: true },
}, S)

// ТЗ 19.11, пример 1.1: 3D стикерпак, белая, 105×148, 150 шт.
const PACK = { product: 'pack', filmGroup: 'white', widthMm: 105, heightMm: 148 }

describe('copy-text', () => {
  it('«Скопировать» совпадает с шаблоном', () => {
    expect(buildShortText(r)).toBe('3D стикерпак · 105×148 мм · 200 шт\nИтого: 36 751 ₽')
  })

  it('линия — 20 знаков «—»', () => {
    expect(TEXT_RULE).toBe('————————————————————')
    expect([...TEXT_RULE]).toHaveLength(20)
  })

  it('ТЗ 1.1, без опций — символ в символ, без блока «Дополнительно:»', () => {
    const res = calculate({ ...PACK, views: [150], options: { resin3d: true } }, S)
    expect(buildDetailedText(res, { material: 'Белая плёнка', lamination: null }, S)).toBe([
      'Расчёт стоимости — Контора',
      '————————————————————',
      'Продукция: 3D стикерпак',
      'Материал: Белая плёнка',
      'Ламинация: нет',
      'Размер: 105 × 148 мм (155,4 см²)',
      'Тираж: 150 шт',
      'Цена за 1 шт: 180,8 ₽',
      '————————————————————',
      'Итого: 27 123 ₽',
    ].join('\n'))
  })

  // Шаблон — символ в символ; итог 40 451 вместо 40 450 из примера ТЗ: пример
  // посчитан с округлённой наценкой (2,3991), калькулятор считает с полной
  // точностью (см. calc.test.js).
  it('ТЗ 1.1, с опциями — символ в символ', () => {
    const res = calculate({
      ...PACK, views: [100, 50], nfcPrice: 6.82, manualHours: 2,
      options: { resin3d: true, urgent: true, nfc: true, manual: true },
    }, S)
    expect(buildDetailedText(res, { material: 'Белая плёнка', lamination: null }, S)).toBe([
      'Расчёт стоимости — Контора',
      '————————————————————',
      'Продукция: 3D стикерпак',
      'Материал: Белая плёнка',
      'Ламинация: нет',
      'Размер: 105 × 148 мм (155,4 см²)',
      'Тираж: 150 шт (вид 1 — 100 шт, вид 2 — 50 шт)',
      'Цена за 1 шт: 256,3 ₽',
      'Дополнительно:',
      '• Срочность: +30%',
      '• NFC-метка: +21,3 ₽/шт',
      '• Ручные операции: 2 ч × 500 ₽',
      '• Дополнительный вид: 1 × 1 000 ₽',
      '————————————————————',
      'Итого: 40 451 ₽',
    ].join('\n'))
  })

  it('пример 2 вида (шаблон 5.4) — доп. вид в блоке «Дополнительно:»', () => {
    expect(buildDetailedText(r, { material: 'Голографическая плёнка', lamination: null })).toBe([
      'Расчёт стоимости — Контора',
      '————————————————————',
      'Продукция: 3D стикерпак',
      'Материал: Голографическая плёнка',
      'Ламинация: нет',
      'Размер: 105 × 148 мм (155,4 см²)',
      'Тираж: 200 шт (вид 1 — 100 шт, вид 2 — 100 шт)',
      'Цена за 1 шт: 178,8 ₽',
      'Дополнительно:',
      '• Дополнительный вид: 1 × 1 000 ₽',
      '————————————————————',
      'Итого: 36 751 ₽',
    ].join('\n'))
  })

  it('строки блока по таблице 1.2: порядок переключателей, форматы, без «Опции:»/«Доплаты:»', () => {
    const r2 = calculate({
      product: 'sticker', filmGroup: 'white', widthMm: 100, heightMm: 100, views: [400, 100],
      nfcPrice: 6.82, manualHours: 1.5,
      options: {
        resin3d: true, lamination: true, montage: true, urgent: true, bag: true, partner: true,
        cut: true, nfc: true, design: true, designEdit: true, manual: true,
      },
    }, S)
    const txt = buildDetailedText(r2, { material: 'Белая плёнка', lamination: 'Матовая' }, S)
    const block = txt.split('\n').filter((l) => l.startsWith('• '))
    expect(block).toEqual([
      '• Монтажная плёнка: 1 500 ₽',
      '• Срочность: +30%',
      '• Упаковка в пакетик: +3 ₽/шт',
      '• Партнёрская скидка: −25%',
      '• Поштучная резка: +15%',
      `• NFC-метка: +${formatPrice(r2.nfcPerUnitDelta).replace(' ₽', '')} ₽/шт`,
      '• Разработка макета: 5 000 ₽',
      '• Правка макета: 3 000 ₽',
      '• Ручные операции: 1,5 ч × 500 ₽',
      '• Дополнительный вид: 1 × 1 000 ₽',
    ])
    expect(txt).toContain('Ламинация: Матовая')
    expect(txt).not.toContain('Опции:')
    expect(txt).not.toContain('Доплаты:')
    expect(txt).not.toContain('Монтажная плёнка: да')
    // 3D и ламинация в блоке не повторяются.
    expect(block.join('\n')).not.toMatch(/3D|Ламинация/)
    // «Итого» сразу под нижней линией, пустых строк нет.
    const lines = txt.split('\n')
    expect(lines.at(-2)).toBe(TEXT_RULE)
    expect(lines.at(-1)).toMatch(/^Итого: /)
    expect(lines.every((l) => l.trim() !== '')).toBe(true)
  })

  it('монтажная плёнка — сумма до 1 ₽', () => {
    const r3 = calculate({
      product: 'sticker', filmGroup: 'white', widthMm: 54, heightMm: 43, views: [1000], options: { montage: true },
    }, S)
    // 23,22 см² × 1 000 × 0,03 = 696,6 → 697 ₽
    expect(buildOptionLines(r3, S)).toEqual([{ key: 'montage', label: 'Монтажная плёнка', text: '697 ₽' }])
  })

  it('без опций — без блока', () => {
    const plain = buildDetailedText(calculate({
      product: 'sticker', filmGroup: 'white', widthMm: 100, heightMm: 100, views: [500], options: {},
    }, S), { material: 'Белая плёнка' })
    expect(plain).not.toContain('Дополнительно:')
    expect(plain).not.toContain('•')
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
    expect(formatHours(2)).toBe('2')
    expect(formatHours(1.5)).toBe('1,5')
    // Разделитель тысяч — обычный пробел (U+0020): текст уходит в мессенджеры.
    expect(formatInt(40450)).toBe('40 450')
  })
})
