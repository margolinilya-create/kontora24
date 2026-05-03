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
})
