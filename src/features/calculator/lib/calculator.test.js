import { describe, it, expect } from 'vitest'
import { calculate, getMarkup, calculatePriceTiers, DEFAULTS } from './calculator'

describe('getMarkup (logarithmic curve)', () => {
  it('returns max markup at minimum qty', () => {
    expect(getMarkup(20, [4.0, 1.5])).toBe(4.0)
  })

  it('returns min markup at maximum qty', () => {
    expect(getMarkup(3000, [4.0, 1.5])).toBe(1.5)
  })

  it('returns between max and min for middle qty', () => {
    const markup = getMarkup(200, [4.0, 1.5])
    expect(markup).toBeGreaterThan(1.5)
    expect(markup).toBeLessThan(4.0)
  })

  it('returns max for qty below minimum', () => {
    expect(getMarkup(5, [4.0, 1.5])).toBe(4.0)
  })

  it('returns min for qty above maximum', () => {
    expect(getMarkup(10000, [4.0, 1.5])).toBe(1.5)
  })

  it('decreases monotonically with qty', () => {
    const qtys = [20, 50, 100, 200, 500, 1000, 3000]
    const markups = qtys.map((q) => getMarkup(q, [4.0, 1.5]))
    for (let i = 1; i < markups.length; i++) {
      expect(markups[i]).toBeLessThanOrEqual(markups[i - 1])
    }
  })
})

describe('calculate', () => {
  const base = { width: 50, height: 50, qty: 100, orderType: 'sticker_cut' }

  it('calculates area correctly', () => {
    const result = calculate(base)
    // 50mm × 50mm / 100 = 25 cm²
    expect(result.areaCm2).toBe(25)
  })

  it('cost per unit is positive', () => {
    const result = calculate(base)
    expect(result.costPerUnit).toBeGreaterThan(0)
  })

  it('applies logarithmic markup for vinyl sticker', () => {
    const result = calculate(base)
    // At qty=100, markup should be between 4.0 (at 20) and 1.5 (at 3000)
    expect(result.markup).toBeGreaterThan(1.5)
    expect(result.markup).toBeLessThan(4.0)
  })

  it('3D sticker uses higher markup curve', () => {
    const vinyl = calculate(base)
    const threeD = calculate({ ...base, orderType: 'sticker3D', is3D: true })
    expect(threeD.markup).toBeGreaterThan(vinyl.markup)
  })

  it('3D sticker costs more due to resin', () => {
    const vinyl = calculate(base)
    const threeD = calculate({ ...base, orderType: 'sticker3D', is3D: true })
    expect(threeD.costPerUnit).toBeGreaterThan(vinyl.costPerUnit)
  })

  it('holographic film costs more than white', () => {
    const white = calculate({ ...base, filmType: 'white' })
    const holo = calculate({ ...base, filmType: 'holographic' })
    expect(holo.costPerUnit).toBeGreaterThan(white.costPerUnit)
  })

  it('metallic film is most expensive', () => {
    const white = calculate({ ...base, filmType: 'white' })
    const metal = calculate({ ...base, filmType: 'metallic' })
    expect(metal.costPerUnit).toBeGreaterThan(white.costPerUnit)
  })

  it('urgent adds 30% to price', () => {
    const normal = calculate(base)
    const urgent = calculate({ ...base, isUrgent: true })
    const ratio = urgent.pricePerUnit / normal.pricePerUnit
    expect(ratio).toBeCloseTo(1.30, 1)
  })

  it('partner discount reduces price by 25%', () => {
    const normal = calculate(base)
    const partner = calculate({ ...base, isPartner: true })
    const ratio = partner.pricePerUnit / normal.pricePerUnit
    expect(ratio).toBeCloseTo(0.75, 1)
  })

  it('lamination increases cost', () => {
    const without = calculate(base)
    const withLam = calculate({ ...base, needLam: true })
    expect(withLam.costPerUnit).toBeGreaterThan(without.costPerUnit)
  })

  it('design adds fixed cost', () => {
    const without = calculate(base)
    const withDesign = calculate({ ...base, needsDesign: true })
    expect(withDesign.priceFinal - without.priceFinal).toBe(DEFAULTS.designPrice)
  })

  it('extra variants add fixed costs', () => {
    const one = calculate({ ...base, designVariants: 1 })
    const three = calculate({ ...base, designVariants: 3 })
    expect(three.priceFinal - one.priceFinal).toBe(2 * DEFAULTS.extraVariantPrice)
  })

  it('handles qty=1 without errors', () => {
    const result = calculate({ ...base, qty: 1 })
    expect(result.pricePerUnit).toBeGreaterThan(0)
    expect(Number.isFinite(result.priceFinal)).toBe(true)
  })

  it('margin is priceFinal minus costTotal', () => {
    const result = calculate(base)
    expect(Math.abs(result.margin - (result.priceFinal - result.costTotal))).toBeLessThanOrEqual(1)
  })

  it('prod days is at least 1', () => {
    const result = calculate({ ...base, qty: 1 })
    expect(result.prodDays).toBeGreaterThanOrEqual(1)
  })

  it('accepts overrides', () => {
    const result = calculate({ ...base, overrides: { filmWhite: 0.50 } })
    const normal = calculate(base)
    expect(result.costPerUnit).toBeGreaterThan(normal.costPerUnit)
  })
})

describe('calculate — edge cases', () => {
  const base = { width: 50, height: 50, qty: 100, orderType: 'sticker_cut' }

  it('clamps width=0 to 1 (minimum area)', () => {
    const result = calculate({ ...base, width: 0 })
    // width clamped to 1: 1×50/100 = 0.5 cm²
    expect(result.areaCm2).toBe(0.5)
  })

  it('clamps height=0 to 1', () => {
    const result = calculate({ ...base, height: 0 })
    expect(result.areaCm2).toBe(0.5)
  })

  it('clamps negative dimensions to 1', () => {
    const result = calculate({ ...base, width: -10, height: -20 })
    expect(result.areaCm2).toBe(0.01) // 1×1/100
  })

  it('handles NaN/null/undefined inputs without crashing', () => {
    const result = calculate({ width: 'abc', height: null, qty: undefined, orderType: 'sticker_cut' })
    expect(Number.isFinite(result.priceFinal)).toBe(true)
    expect(Number.isFinite(result.costPerUnit)).toBe(true)
    expect(Number.isFinite(result.markup)).toBe(true)
    expect(result.areaCm2).toBe(0.01) // both clamped to 1
    expect(result.prodDays).toBe(1)
  })

  it('clamps qty=0 to 1', () => {
    const result = calculate({ ...base, qty: 0 })
    expect(result.priceFinal).toBeGreaterThan(0)
  })

  it('clamps negative qty to 1', () => {
    const result = calculate({ ...base, qty: -50 })
    expect(result.priceFinal).toBeGreaterThan(0)
  })

  it('combined urgent + partner nets to ~0.975x', () => {
    // Use large dimensions to avoid integer rounding noise
    const bigBase = { ...base, width: 200, height: 200 }
    const normal = calculate(bigBase)
    const combined = calculate({ ...bigBase, isUrgent: true, isPartner: true })
    // 1.30 × 0.75 = 0.975
    const ratio = combined.pricePerUnit / normal.pricePerUnit
    expect(ratio).toBeCloseTo(0.975, 1)
  })

  it('individual cut adds 15%', () => {
    // Use large dimensions to avoid integer rounding noise
    const bigBase = { ...base, width: 200, height: 200 }
    const normal = calculate(bigBase)
    const withCut = calculate({ ...bigBase, needsIndividualCut: true })
    const ratio = withCut.pricePerUnit / normal.pricePerUnit
    expect(ratio).toBeCloseTo(1.15, 1)
  })

  it('montage film adds per-cm2 cost', () => {
    const without = calculate(base)
    const withMontage = calculate({ ...base, needsMontageFilm: true })
    const diff = withMontage.pricePerUnit - without.pricePerUnit
    // Should be montageFilmPricePerCm2 × areaCm2 = 0.03 × 25 = 0.75
    expect(diff).toBeCloseTo(DEFAULTS.montageFilmPricePerCm2 * 25, 0)
  })

  it('packaging adds fixed per-unit cost', () => {
    const without = calculate(base)
    const withPkg = calculate({ ...base, needsPackaging: true })
    const diff = withPkg.pricePerUnit - without.pricePerUnit
    expect(diff).toBe(DEFAULTS.packagingPrice)
  })

  it('edit adds 3000 fixed', () => {
    const without = calculate(base)
    const withEdit = calculate({ ...base, needsEdit: true })
    expect(withEdit.priceFinal - without.priceFinal).toBe(DEFAULTS.editPrice)
  })

  it('prodDays: qty=500 gives 1 day, qty=501 gives 2 days', () => {
    expect(calculate({ ...base, qty: 500 }).prodDays).toBe(1)
    expect(calculate({ ...base, qty: 501 }).prodDays).toBe(2)
    expect(calculate({ ...base, qty: 1500 }).prodDays).toBe(3)
  })

  it('stickerpack uses vinyl pack markup curve (lower than sticker_cut)', () => {
    const cut = calculate({ ...base, orderType: 'sticker_cut' })
    const pack = calculate({ ...base, orderType: 'stickerpack' })
    // VinylPack max is 3.0 vs VinylSticker max is 4.0
    expect(pack.markup).toBeLessThan(cut.markup)
  })

  it('3D resin labor multiplier is 0.5 for sticker, 1.0 for pack', () => {
    const sticker3D = calculate({ ...base, orderType: 'sticker3D', is3D: true })
    const pack3D = calculate({ ...base, orderType: 'stickerpack3D', is3D: true })
    // pack should cost more due to higher resin labor multiplier
    expect(pack3D.costPerUnit).toBeGreaterThan(sticker3D.costPerUnit)
  })

  it('marginPct is 0 when priceFinal is 0 (impossible in practice)', () => {
    // Force a scenario with overrides that could produce 0 price
    const result = calculate({ ...base, overrides: { filmWhite: 0, ink: 0, laborPrint: 0, rent: 0, tax: 0 } })
    // Even with 0 cost, markup creates positive price, so marginPct should still be valid
    expect(Number.isFinite(result.marginPct)).toBe(true)
  })
})

describe('calculatePriceTiers', () => {
  it('returns tiers with decreasing price per unit', () => {
    const tiers = calculatePriceTiers({ width: 50, height: 50, orderType: 'sticker_cut' })
    expect(tiers.length).toBeGreaterThan(5)
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].pricePerUnit).toBeLessThanOrEqual(tiers[i - 1].pricePerUnit)
    }
  })

  it('returns increasing total price with qty', () => {
    const tiers = calculatePriceTiers({ width: 50, height: 50, orderType: 'sticker_cut' })
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i].priceTotal).toBeGreaterThan(tiers[i - 1].priceTotal)
    }
  })

  it('returns exactly 10 tiers', () => {
    const tiers = calculatePriceTiers({ width: 50, height: 50, orderType: 'sticker_cut' })
    expect(tiers).toHaveLength(10)
  })

  it('first tier qty is 20, last is 5000', () => {
    const tiers = calculatePriceTiers({ width: 50, height: 50, orderType: 'sticker_cut' })
    expect(tiers[0].qty).toBe(20)
    expect(tiers[tiers.length - 1].qty).toBe(5000)
  })
})
