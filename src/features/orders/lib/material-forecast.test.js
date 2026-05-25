import { describe, it, expect } from 'vitest'
import {
  getPrintBlockWidth,
  computeFilmMeters,
  computeLamMeters,
  computeResinGrams,
  computeBoppQty,
  forecastMaterials,
} from './material-forecast'

describe('getPrintBlockWidth', () => {
  it('маппит белую/прозрачную плёнку на 1230 мм', () => {
    expect(getPrintBlockWidth('G')).toBe(1230)
    expect(getPrintBlockWidth('M')).toBe(1230)
    expect(getPrintBlockWidth('Transparent_G')).toBe(1230)
    expect(getPrintBlockWidth('Transparent_M')).toBe(1230)
  })
  it('маппит Oracal 352 Золото/Серебро на 970 мм', () => {
    expect(getPrintBlockWidth('Gold')).toBe(970)
    expect(getPrintBlockWidth('Chrome')).toBe(970)
  })
  it('маппит голографию на 1220 мм', () => {
    expect(getPrintBlockWidth('Holo')).toBe(1220)
  })
  it('возвращает 1230 для неизвестного типа', () => {
    expect(getPrintBlockWidth(undefined)).toBe(1230)
    expect(getPrintBlockWidth('XXX')).toBe(1230)
  })
})

describe('computeFilmMeters', () => {
  it('возвращает 0 при пустых параметрах', () => {
    expect(computeFilmMeters({ widthMm: 0, heightMm: 100, qty: 100 })).toBe(0)
    expect(computeFilmMeters({ widthMm: 100, heightMm: 0, qty: 100 })).toBe(0)
    expect(computeFilmMeters({ widthMm: 100, heightMm: 100, qty: 0 })).toBe(0)
  })

  it('правильно считает строки и метры (полный ряд)', () => {
    // 105 × 148, тираж 100, блок 1230. items_per_row = floor(1230 / 111) = 11
    // rows = ceil(100/11) = 10; meters = 10 × (148+30) / 1000 = 1.78
    const m = computeFilmMeters({ widthMm: 105, heightMm: 148, qty: 100, blockWidthMm: 1230 })
    expect(m).toBeCloseTo(1.78, 5)
  })

  it('правильно округляет вверх если тираж не делится', () => {
    // 40 × 40, тираж 800, блок 1230. items_per_row = floor(1230/46) = 26
    // rows = ceil(800/26) = 31; meters = 31 × 70 / 1000 = 2.17
    const m = computeFilmMeters({ widthMm: 40, heightMm: 40, qty: 800, blockWidthMm: 1230 })
    expect(m).toBeCloseTo(2.17, 5)
  })

  it('меньшая ширина блока (голография) даёт больше метров для того же изделия', () => {
    const w1230 = computeFilmMeters({ widthMm: 105, heightMm: 148, qty: 300, blockWidthMm: 1230 })
    const w970 = computeFilmMeters({ widthMm: 105, heightMm: 148, qty: 300, blockWidthMm: 970 })
    expect(w970).toBeGreaterThan(w1230)
  })

  it('если изделие шире блока — items_per_row = 1', () => {
    // 1500 × 200, тираж 5 — не помещается
    const m = computeFilmMeters({ widthMm: 1500, heightMm: 200, qty: 5, blockWidthMm: 1230 })
    expect(m).toBeCloseTo(5 * 230 / 1000, 5) // 5 рядов × 230 мм
  })
})

describe('computeLamMeters', () => {
  it('использует ширину 1230 (всегда)', () => {
    const lam = computeLamMeters({ widthMm: 100, heightMm: 100, qty: 50 })
    const film = computeFilmMeters({ widthMm: 100, heightMm: 100, qty: 50, blockWidthMm: 1230 })
    expect(lam).toBe(film)
  })
})

describe('computeResinGrams', () => {
  it('0 для не-3D типов', () => {
    expect(computeResinGrams({ orderType: 'sticker_cut', widthMm: 100, heightMm: 100, qty: 100 })).toBe(0)
    expect(computeResinGrams({ orderType: 'stickerpack', widthMm: 100, heightMm: 100, qty: 100 })).toBe(0)
  })

  it('sticker3D: полная площадь × тираж × 0.1444', () => {
    // 40 × 40 мм = 16 см² × 800 × 0.1444 ≈ 1848.32 г
    const g = computeResinGrams({ orderType: 'sticker3D', widthMm: 40, heightMm: 40, qty: 800 })
    expect(g).toBeCloseTo(16 * 800 * 0.1444, 4)
  })

  it('stickerpack3D: эффективная площадь (W−8)(H−8) × 0.6 × тираж × 0.1444', () => {
    // 105 × 148: inner = 97 × 140 = 13580 мм² → 135.8 см² × 0.6 = 81.48 см²
    // × 300 × 0.1444 ≈ 3529.7 г
    const g = computeResinGrams({ orderType: 'stickerpack3D', widthMm: 105, heightMm: 148, qty: 300 })
    expect(g).toBeCloseTo(((97 * 140) / 100) * 0.6 * 300 * 0.1444, 4)
  })

  it('защита от отрицательных дельт при микро-размере (W<8)', () => {
    const g = computeResinGrams({ orderType: 'stickerpack3D', widthMm: 5, heightMm: 5, qty: 10 })
    expect(g).toBe(0)
  })
})

describe('computeBoppQty', () => {
  it('возвращает 0 если флаг bopp_bag=false', () => {
    expect(computeBoppQty({ qty: 100, hasBopp: false })).toBe(0)
  })
  it('возвращает тираж если bopp_bag=true', () => {
    expect(computeBoppQty({ qty: 250, hasBopp: true })).toBe(250)
  })
})

describe('forecastMaterials', () => {
  it('возвращает только плёнку для базового стикера без ламинации', () => {
    const rows = forecastMaterials({
      orderType: 'sticker_cut',
      widthMm: 105, heightMm: 148, qty: 100,
      filmType: 'G', lamType: null, boppBag: false,
    })
    expect(rows.map((r) => r.key)).toEqual(['film'])
    expect(rows[0].expected).toBeGreaterThan(0)
    expect(rows[0].lookup).toEqual({ by: 'code', value: 'G' })
  })

  it('добавляет ламинацию когда lam_type выставлен', () => {
    const rows = forecastMaterials({
      orderType: 'sticker_cut',
      widthMm: 105, heightMm: 148, qty: 100,
      filmType: 'G', lamType: 'matte', boppBag: false,
    })
    expect(rows.map((r) => r.key)).toContain('lam')
    const lam = rows.find((r) => r.key === 'lam')
    expect(lam.lookup).toEqual({ by: 'code', value: 'matte' })
  })

  it('lam_type=transfer добавляет строку «перенос на монтаж» с lookup code=transfer', () => {
    const rows = forecastMaterials({
      orderType: 'sticker_cut',
      widthMm: 105, heightMm: 148, qty: 100,
      filmType: 'G', lamType: 'transfer', boppBag: false,
    })
    const lam = rows.find((r) => r.key === 'lam')
    expect(lam).toBeTruthy()
    expect(lam.lookup).toEqual({ by: 'code', value: 'transfer' })
    expect(lam.label).toContain('Монтажная')
  })

  it('добавляет смолу для sticker3D и stickerpack3D', () => {
    const a = forecastMaterials({ orderType: 'sticker3D', widthMm: 40, heightMm: 40, qty: 100, filmType: 'G' })
    expect(a.find((r) => r.key === 'resin')).toBeTruthy()
    const b = forecastMaterials({ orderType: 'stickerpack3D', widthMm: 105, heightMm: 148, qty: 100, filmType: 'G' })
    expect(b.find((r) => r.key === 'resin')).toBeTruthy()
  })

  it('добавляет БОПП когда флаг включён', () => {
    const rows = forecastMaterials({
      orderType: 'stickerpack3D',
      widthMm: 105, heightMm: 148, qty: 200,
      filmType: 'G', boppBag: true,
    })
    const bopp = rows.find((r) => r.key === 'bopp')
    expect(bopp).toBeTruthy()
    expect(bopp.expected).toBe(200)
    expect(bopp.lookup).toEqual({ by: 'type', value: 'packaging_bag' })
  })

  it('пустые строки если ни одного валидного параметра', () => {
    expect(forecastMaterials({})).toEqual([])
  })
})
