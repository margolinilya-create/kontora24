import { describe, it, expect } from 'vitest'
import {
  calculate, optionDeltas, priceTiers, normalizeSettings, splitQty, clampQty, sumViews,
  validateCalcSettings, markupFor, productLabel, orderTypeFor, setPath, clampManualHours,
  DEFAULT_CALC_SETTINGS, TIERS_STICKER, TIERS_PACK,
} from './calc'

// Средняя цена NFC-метки на складе 19.11 (unit_cost = 6,8181818…).
const NFC_STOCK_PRICE = 75 / 11

const S = DEFAULT_CALC_SETTINGS

// Приложение А.4 — контрольные расчёты (ставки А.3), сверка до рубля.
const CONTROL = [
  {
    n: 1, name: 'Стикер, белая, 100×100, 500 шт, без опций',
    input: { product: 'sticker', filmGroup: 'white', widthMm: 100, heightMm: 100, views: [500], options: {} },
    c: 0.10, m: 2.13, p: 21.3, t: 10651,
  },
  {
    n: 2, name: '3D стикерпак, голографическая, 105×148, 200 шт',
    input: { product: 'pack', filmGroup: 'holo', widthMm: 105, heightMm: 148, views: [200], options: { resin3d: true } },
    c: 0.495, m: 2.32, p: 178.8, t: 35751,
  },
  {
    n: 3, name: 'Расчёт 1 + срочность',
    input: { product: 'sticker', filmGroup: 'white', widthMm: 100, heightMm: 100, views: [500], options: { urgent: true } },
    c: 0.10, m: 2.13, p: 27.7, t: 13846,
  },
  {
    n: 4, name: '3D стикер, белая, 50×50, 300 шт, поштучная резка + пакетик',
    input: { product: 'sticker', filmGroup: 'white', widthMm: 50, heightMm: 50, views: [300], options: { resin3d: true, cut: true, bag: true } },
    c: 0.66, m: 3.44, p: 68.2, t: 20469,
  },
  {
    n: 5, name: 'Расчёт 1 + 3 вида + правка макета + монтажная плёнка',
    input: { product: 'sticker', filmGroup: 'white', widthMm: 100, heightMm: 100, views: splitQty(500, 3), options: { designEdit: true, montage: true } },
    c: 0.10, m: 2.13, p: 21.3, t: 17151,
  },
  {
    n: 6, name: '3D стикерпак, белая, 148×210, 500 шт, ламинация + срочность + партнёр + пакетик + 3 вида + разработка',
    input: {
      product: 'pack', filmGroup: 'white', widthMm: 148, heightMm: 210, views: splitQty(500, 3),
      options: { resin3d: true, lamination: true, urgent: true, partner: true, bag: true, design: true },
    },
    c: 0.515, m: 2.10, p: 330.6, t: 172302,
  },
]

describe('calculate — контрольные расчёты А.4', () => {
  for (const ctl of CONTROL) {
    it(`№${ctl.n}: ${ctl.name} → ${ctl.t} ₽`, () => {
      const r = calculate(ctl.input, S)
      expect(r.costPerCm2).toBeCloseTo(ctl.c, 6)
      expect(Math.round(r.markup * 100) / 100).toBe(ctl.m)
      expect(r.pricePerUnitRounded).toBe(ctl.p)
      expect(r.totalRounded).toBe(ctl.t)
    })
  }

  it('эталон из шаблона копирования: расчёт 2 с двумя видами = 36 751 ₽', () => {
    const r = calculate({ ...CONTROL[1].input, views: [100, 100] }, S)
    expect(r.totalRounded).toBe(36751)
    expect(r.pricePerUnitRounded).toBe(178.8)
  })
})

describe('calculate — поведение', () => {
  const base = CONTROL[0].input

  it('каждый дополнительный вид добавляет 1 000 ₽', () => {
    const t1 = calculate({ ...base, views: [500] }, S).total
    const t2 = calculate({ ...base, views: [250, 250] }, S).total
    const t9 = calculate({ ...base, views: splitQty(500, 9) }, S).total
    expect(t2 - t1).toBeCloseTo(1000, 6)
    expect(t9 - t1).toBeCloseTo(8000, 6)
  })

  it('тираж = сумма видов', () => {
    const r = calculate({ ...base, views: [300, 150, 50] }, S)
    expect(r.qty).toBe(500)
    expect(r.viewsCount).toBe(3)
  })

  it('поштучная резка не действует у стикерпака', () => {
    const on = calculate({ ...CONTROL[1].input, options: { resin3d: true, cut: true } }, S)
    expect(on.totalRounded).toBe(35751)
    expect(on.input.options.cut).toBe(false)
  })

  it('доплаты и монтажная плёнка не наценяются и не зависят от срочности/партнёра', () => {
    const plain = calculate({ ...base, options: { montage: true, design: true } }, S)
    const urgent = calculate({ ...base, options: { montage: true, design: true, urgent: true, partner: true } }, S)
    const plainNo = calculate(base, S)
    const urgentNo = calculate({ ...base, options: { urgent: true, partner: true } }, S)
    expect(plain.total - plainNo.total).toBeCloseTo(urgent.total - urgentNo.total, 6)
    expect(plain.total - plainNo.total).toBeCloseTo(5000 + 100 * 500 * 0.03, 6)
  })

  it('наценка — плато после qmax', () => {
    expect(markupFor(3000, 3000, 4, 1.5)).toBeCloseTo(1.5, 9)
    expect(markupFor(20000, 3000, 4, 1.5)).toBeCloseTo(1.5, 9)
    expect(markupFor(5, 3000, 4, 1.5)).toBeCloseTo(4, 9)
  })

  it('тип продукции и тип заказа', () => {
    expect(productLabel({ product: 'sticker', resin3d: false, cut: true })).toBe('Стикер вырубной')
    expect(productLabel({ product: 'sticker', resin3d: false, cut: false })).toBe('Стикер на подложке')
    expect(productLabel({ product: 'sticker', resin3d: true })).toBe('3D стикер')
    expect(productLabel({ product: 'pack', resin3d: false })).toBe('Стикерпак')
    expect(productLabel({ product: 'pack', resin3d: true })).toBe('3D стикерпак')
    expect(orderTypeFor({ product: 'sticker', cut: true })).toBe('sticker_cut')
    expect(orderTypeFor({ product: 'sticker', cut: false })).toBe('sticker_kiss')
    expect(orderTypeFor({ product: 'sticker', resin3d: true })).toBe('sticker3D')
    expect(orderTypeFor({ product: 'pack' })).toBe('stickerpack')
    expect(orderTypeFor({ product: 'pack', resin3d: true })).toBe('stickerpack3D')
  })

  it('ставки берутся из настроек', () => {
    const custom = setPath(S, 'vinyl.tax', 0.12)
    const r = calculate(base, custom)
    expect(r.costPerCm2).toBeCloseTo(0.2, 9)
  })
})

describe('optionDeltas — чипы «+X ₽»', () => {
  it('чип = T с опцией − T без неё', () => {
    const d = optionDeltas(CONTROL[0].input, S)
    expect(Math.round(d.urgent)).toBe(13846 - 10651 + 0) // 3 195,25
    expect(Math.round(d.design)).toBe(5000)
    expect(Math.round(d.designEdit)).toBe(3000)
    expect(Math.round(d.bag)).toBe(1500)
    expect(d.partner).toBeLessThan(0)
  })

  it('чип ламинации стикера 100×100 на 500 шт = 3 195 ₽ при ставке 0,03 (ТЗ 5.5)', () => {
    const d = optionDeltas(CONTROL[0].input, S)
    expect(Math.round(d.lamination)).toBe(3195)
    const d2 = optionDeltas(CONTROL[0].input, setPath(S, 'lamination', 0.02))
    expect(Math.round(d2.lamination)).toBe(2130)
  })

  it('у стикерпака поштучная резка = 0', () => {
    expect(optionDeltas(CONTROL[1].input, S).cut).toBe(0)
  })
})

describe('priceTiers', () => {
  it('стикер — 14 ступеней, пак — 12, текущая подсвечена', () => {
    const t = priceTiers(CONTROL[0].input, S)
    expect(t).toHaveLength(14)
    expect(TIERS_STICKER).toHaveLength(14)
    expect(TIERS_PACK).toHaveLength(12)
    expect(t.filter((x) => x.current)).toHaveLength(1)
    expect(t.find((x) => x.current).from).toBe(500)
    expect(priceTiers(CONTROL[1].input, S)).toHaveLength(12)
  })

  it('цена на нижней границе ступени = расчёт с этим тиражом', () => {
    const t = priceTiers(CONTROL[0].input, S)
    const at500 = t.find((x) => x.from === 500)
    expect(Math.round(at500.total)).toBe(10651)
  })
})

describe('тираж и виды', () => {
  it('splitQty: поровну, остаток — в вид 1', () => {
    expect(splitQty(500, 3)).toEqual([168, 166, 166])
    expect(splitQty(100, 2)).toEqual([50, 50])
    expect(sumViews(splitQty(1001, 9))).toBe(1001)
  })

  it('clampQty: «15» → 20, «150» остаётся, > 20 000 → 20 000', () => {
    expect(clampQty('15')).toBe(20)
    expect(clampQty('150')).toBe(150)
    expect(clampQty(25000)).toBe(20000)
    expect(clampQty('')).toBe(20)
  })
})

describe('настройки', () => {
  it('normalizeSettings дополняет недостающее значениями А.3', () => {
    const n = normalizeSettings({ ink: 0.02, vinyl: { tax: 0.05 } })
    expect(n.ink).toBe(0.02)
    expect(n.vinyl.tax).toBe(0.05)
    expect(n.vinyl.rent).toBe(0.01)
    expect(n.options.extra_view_rub).toBe(1000)
    expect(normalizeSettings(null)).toEqual(normalizeSettings(DEFAULT_CALC_SETTINGS))
  })

  it('validateCalcSettings: дефолты валидны', () => {
    expect(validateCalcSettings(S)).toEqual({})
  })

  it('validateCalcSettings: отрицательные, три знака, min > max', () => {
    let s = setPath(S, 'ink', -1)
    expect(validateCalcSettings(s).ink).toBeTruthy()
    s = setPath(S, 'labor_print', 0.035)
    expect(validateCalcSettings(s).labor_print).toMatch(/двух знаков/)
    s = setPath(S, 'vinyl.markup_sticker_min', 5)
    expect(validateCalcSettings(s)['vinyl.markup_sticker_min']).toMatch(/больше максимальной/)
    s = setPath(S, 'options.design_rub', '')
    expect(validateCalcSettings(s)['options.design_rub']).toBeTruthy()
    // наценки и опции — не ставки ₽/см², больше двух знаков разрешено
    s = setPath(S, 'vinyl.markup_sticker_max', 4.125)
    expect(validateCalcSettings(s)['vinyl.markup_sticker_max']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// R27 (ТЗ 19.11, 4.5 и 1.1): материал по цене склада, NFC, ручные операции.
// Бумага Ситилайт: unit_cost 185,35 ₽/п.м, ширина 1,27 м → 0,014594 ₽/см²,
// × K 1,5 → 0,0219 ₽/см².
// ---------------------------------------------------------------------------
const PAPER_CM2 = 185.35 / (1.27 * 10000)

describe('R27: контрольные расчёты 4.5', () => {
  const sticker = { product: 'sticker', filmGroup: 'white', widthMm: 50, heightMm: 50, views: [300], options: { cut: true } }

  it('стикер вырубной 50×50, 300 шт, резка, белая плёнка → 6,8 ₽/шт и 2 030 ₽', () => {
    const r = calculate(sticker, S)
    expect(r.pricePerUnitRounded).toBe(6.8)
    expect(r.totalRounded).toBe(2030)
    expect(r.productLabel).toBe('Стикер вырубной')
  })

  it('то же на бумаге Ситилайт (цена склада × K 1,5 = 0,0219 ₽/см²) → 6,2 ₽/шт и 1 866 ₽', () => {
    const r = calculate({ ...sticker, materialPriceCm2: PAPER_CM2 }, S)
    const material = r.costBreakdown.find((i) => i.key === 'film')
    expect(material.label).toBe('Материал')
    expect(Math.round(material.value * 10000) / 10000).toBe(0.0219)
    expect(r.pricePerUnitRounded).toBe(6.2)
    expect(r.totalRounded).toBe(1866)
  })

  it('коэффициент материала берётся из настроек; к цене группы не применяется', () => {
    const k2 = setPath(S, 'material_k', 2)
    expect(calculate({ ...sticker, materialPriceCm2: PAPER_CM2 }, k2).costBreakdown[0].value).toBeCloseTo(PAPER_CM2 * 2, 9)
    expect(calculate(sticker, k2).totalRounded).toBe(2030)
  })

  it('3D стикерпак, белая, 105×148, 150 шт → 180,8 ₽/шт, 27 123 ₽', () => {
    const r = calculate({ product: 'pack', filmGroup: 'white', widthMm: 105, heightMm: 148, views: [150], options: { resin3d: true } }, S)
    expect(r.pricePerUnitRounded).toBe(180.8)
    expect(r.totalRounded).toBe(27123)
  })

  // Цена метки — реальная средняя цена склада на 19.11: 6,8181… ₽ (75/11),
  // в ТЗ показана округлённо как 6,82. С ней итог совпадает с ТЗ: 40 450 ₽.
  it('+ виды 100+50, срочность, NFC 6,82 ₽ (склад 75/11), 2 ч ручных → 256,3 ₽/шт, 40 450 ₽, NFC +21,3 ₽/шт', () => {
    const r = calculate({
      product: 'pack', filmGroup: 'white', widthMm: 105, heightMm: 148, views: [100, 50],
      nfcPrice: NFC_STOCK_PRICE, manualHours: 2,
      options: { resin3d: true, urgent: true, nfc: true, manual: true },
    }, S)
    expect(r.pricePerUnitRounded).toBe(256.3)
    expect(r.totalRounded).toBe(40450)
    expect(Math.round(r.nfcPerUnitDelta * 10) / 10).toBe(21.3)
    expect(r.nfcCostPerUnit).toBe(NFC_STOCK_PRICE)
    // Ручные операции — фиксированная доплата, в цену за штуку не входит.
    expect(r.extras.find((e) => e.key === 'manual')).toMatchObject({ hours: 2, rate: 500, amount: 1000 })
  })
})

describe('R27: NFC-метка', () => {
  const base = { product: 'pack', filmGroup: 'white', widthMm: 105, heightMm: 148, views: [150], options: { resin3d: true } }

  it('надбавка = цена с меткой − без неё; K к метке не применяется', () => {
    const off = calculate(base, S)
    const on = calculate({ ...base, nfcPrice: 6.82, options: { ...base.options, nfc: true } }, S)
    expect(on.pricePerUnit - off.pricePerUnit).toBeCloseTo(on.nfcPerUnitDelta, 9)
    expect(on.costPerUnit - off.costPerUnit).toBeCloseTo(6.82, 9)
    const k3 = calculate({ ...base, nfcPrice: 6.82, options: { ...base.options, nfc: true } }, setPath(S, 'material_k', 3))
    expect(k3.totalRounded).toBe(on.totalRounded)
  })

  it('без цены метки опция не действует', () => {
    const r = calculate({ ...base, options: { ...base.options, nfc: true } }, S)
    expect(r.totalRounded).toBe(27123)
    expect(r.input.options.nfc).toBe(false)
    expect(r.nfcPerUnitDelta).toBe(0)
  })

  it('чип и таблица по тиражам учитывают метку', () => {
    const input = { ...base, nfcPrice: 6.82 }
    const d = optionDeltas(input, S)
    expect(d.nfc).toBeCloseTo(calculate({ ...input, options: { ...base.options, nfc: true } }, S).total - 27123.12, 1)
    const on = priceTiers({ ...input, options: { ...base.options, nfc: true } }, S)
    const off = priceTiers(base, S)
    expect(on.every((t, i) => t.pricePerUnit > off[i].pricePerUnit)).toBe(true)
  })

  it('срочность, резка и скидка действуют на метку', () => {
    const plain = calculate({ ...base, nfcPrice: 10, options: { ...base.options, nfc: true } }, S)
    const urgent = calculate({ ...base, nfcPrice: 10, options: { ...base.options, nfc: true, urgent: true, partner: true } }, S)
    expect(urgent.nfcPerUnitDelta).toBeCloseTo(plain.nfcPerUnitDelta * 1.3 * 0.75, 9)
  })
})

describe('R27: ручные операции', () => {
  const base = CONTROL[0].input

  it('сумма = часы × ставка, без наценки, срочности и скидки; чип = сумма', () => {
    const on = calculate({ ...base, manualHours: 2, options: { manual: true, urgent: true, partner: true } }, S)
    const off = calculate({ ...base, options: { urgent: true, partner: true } }, S)
    expect(on.total - off.total).toBeCloseTo(1000, 9)
    expect(on.pricePerUnit).toBeCloseTo(off.pricePerUnit, 9)
    expect(optionDeltas({ ...base, manualHours: 1.5 }, S).manual).toBeCloseTo(750, 9)
    expect(calculate({ ...base, manualHours: 2, options: { manual: true } }, setPath(S, 'options.manual_rate_rub', 800)).extrasTotal).toBe(1600)
  })

  it('таблица по тиражам добавляет сумму один раз', () => {
    const on = priceTiers({ ...base, manualHours: 2, options: { manual: true } }, S)
    const off = priceTiers(base, S)
    on.forEach((t, i) => expect(t.total - off[i].total).toBeCloseTo(1000, 6))
  })

  it('часы: шаг 0,5, от 0,5 до 100, по умолчанию 1', () => {
    expect(clampManualHours('')).toBe(1)
    expect(clampManualHours('1,5')).toBe(1.5)
    expect(clampManualHours(1.3)).toBe(1.5)
    expect(clampManualHours(0)).toBe(0.5)
    expect(clampManualHours(250)).toBe(100)
    expect(calculate({ ...base, options: { manual: true } }, S).extras.find((e) => e.key === 'manual').hours).toBe(1)
  })
})

describe('R27: настройки', () => {
  it('новые ключи по умолчанию', () => {
    const n = normalizeSettings({})
    expect(n.material_k).toBe(1.5)
    expect(n.nfc_material_id).toBeNull()
    expect(n.options.manual_rate_rub).toBe(500)
    expect(normalizeSettings({ nfc_material_id: 'abc' }).nfc_material_id).toBe('abc')
  })

  it('коэффициент материала 0,5–5', () => {
    expect(validateCalcSettings(setPath(S, 'material_k', 0.4)).material_k).toBeTruthy()
    expect(validateCalcSettings(setPath(S, 'material_k', 5.5)).material_k).toBeTruthy()
    expect(validateCalcSettings(setPath(S, 'material_k', 1.25)).material_k).toBeUndefined()
  })
})
