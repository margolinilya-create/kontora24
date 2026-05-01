import { describe, it, expect } from 'vitest'
import { calculate, getVolumeDiscount, getMarkup } from './calculator'

describe('getVolumeDiscount', () => {
  it('returns 0 for qty 1-9', () => {
    expect(getVolumeDiscount(1)).toBe(0)
    expect(getVolumeDiscount(9)).toBe(0)
  })

  it('returns 5% for qty 10-24', () => {
    expect(getVolumeDiscount(10)).toBe(0.05)
    expect(getVolumeDiscount(24)).toBe(0.05)
  })

  it('returns 30% for qty 500+', () => {
    expect(getVolumeDiscount(500)).toBe(0.30)
    expect(getVolumeDiscount(10000)).toBe(0.30)
  })

  it('returns 0 for qty 0 or negative', () => {
    expect(getVolumeDiscount(0)).toBe(0)
    expect(getVolumeDiscount(-5)).toBe(0)
  })
})

describe('getMarkup', () => {
  it('returns 4.0 for regular stickers', () => {
    expect(getMarkup('sticker_cut')).toBe(4.0)
    expect(getMarkup('stickerpack')).toBe(4.0)
  })

  it('returns 4.5 for 3D stickers', () => {
    expect(getMarkup('sticker3D')).toBe(4.5)
    expect(getMarkup('stickerpack3D')).toBe(4.5)
  })

  it('returns 4.0 for unknown types', () => {
    expect(getMarkup('nonexistent')).toBe(4.0)
  })
})

describe('calculate', () => {
  const base = { width: 50, height: 50, qty: 100, orderType: 'sticker_cut' }

  it('calculates items per sheet correctly', () => {
    const result = calculate(base)
    // floor(1230 / (50 + 6)) = floor(21.96) = 21
    expect(result.itemsPerSheet).toBe(21)
  })

  it('calculates sheets correctly', () => {
    const result = calculate(base)
    // ceil(100 / 21) = 5
    expect(result.sheets).toBe(5)
  })

  it('calculates film area correctly', () => {
    const result = calculate(base)
    // 5 * (1230 * (50 + 30)) / 1_000_000 = 5 * 0.0984 = 0.492
    expect(result.filmM2).toBe(0.492)
  })

  it('calculates ink area correctly', () => {
    const result = calculate(base)
    // 100 * (50 * 50) / 1_000_000 = 0.25
    expect(result.inkM2).toBe(0.25)
  })

  it('applies correct markup', () => {
    const result = calculate(base)
    expect(result.markup).toBe(4.0)
  })

  it('applies volume discount for 100 units', () => {
    const result = calculate(base)
    expect(result.discount).toBe(0.20)
  })

  it('final price applies markup and discount', () => {
    const result = calculate(base)
    // Allow small rounding diff due to intermediate rounding
    const expected = result.costTotal * 4.0 * (1 - 0.20)
    expect(Math.abs(result.priceFinal - Math.round(expected))).toBeLessThanOrEqual(5)
  })

  it('price per unit is positive', () => {
    const result = calculate(base)
    expect(result.pricePerUnit).toBeGreaterThan(0)
  })

  it('handles qty=0 without division by zero', () => {
    const result = calculate({ ...base, qty: 0 })
    expect(result.pricePerUnit).toBe(0)
    expect(Number.isFinite(result.priceFinal)).toBe(true)
    expect(Number.isFinite(result.marginPct)).toBe(true)
  })

  it('handles negative dimensions gracefully', () => {
    const result = calculate({ ...base, width: -10, height: -10 })
    expect(result.filmM2).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(result.priceFinal)).toBe(true)
  })

  it('includes lamination costs when needLam is true', () => {
    const without = calculate(base)
    const withLam = calculate({ ...base, needLam: true })
    expect(withLam.costLam).toBeGreaterThan(0)
    expect(withLam.costMaterials).toBeGreaterThan(without.costMaterials)
  })

  it('includes resin costs for 3D stickers', () => {
    const result = calculate({ ...base, orderType: 'sticker3D', is3D: true })
    expect(result.resinG).toBeGreaterThan(0)
    expect(result.costResin).toBeGreaterThan(0)
    expect(result.markup).toBe(4.5)
  })

  it('prod days is at least 1', () => {
    const result = calculate({ ...base, qty: 1 })
    expect(result.prodDays).toBeGreaterThanOrEqual(1)
  })

  it('margin is close to priceFinal minus costTotal', () => {
    const result = calculate(base)
    expect(Math.abs(result.margin - (result.priceFinal - result.costTotal))).toBeLessThanOrEqual(1)
  })

  it('accepts overrides for defaults', () => {
    const result = calculate({ ...base, overrides: { laborCostPerHour: 1000 } })
    const normal = calculate(base)
    expect(result.costLabor).toBeGreaterThan(normal.costLabor)
  })
})
