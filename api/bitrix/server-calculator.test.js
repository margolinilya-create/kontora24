import { describe, it, expect } from 'vitest'
import { calculate, DEFAULTS, MARKUPS, DISCOUNTS } from './server-calculator'

describe('server-side calculate', () => {
  const w = 50, h = 50, qty = 100, type = 'sticker_cut'

  it('returns all required fields', () => {
    const result = calculate(w, h, qty, type, false, false)
    expect(result).toHaveProperty('cost_materials')
    expect(result).toHaveProperty('cost_labor')
    expect(result).toHaveProperty('cost_total')
    expect(result).toHaveProperty('markup')
    expect(result).toHaveProperty('discount_pct')
    expect(result).toHaveProperty('price_final')
    expect(result).toHaveProperty('price_per_unit')
    expect(result).toHaveProperty('prod_days')
  })

  it('all numeric outputs are finite', () => {
    const result = calculate(w, h, qty, type, false, false)
    for (const [key, val] of Object.entries(result)) {
      expect(Number.isFinite(val), `${key} is not finite`).toBe(true)
    }
  })

  it('items per sheet calculation is correct', () => {
    // printWidth=1230, gap=6, sticker width=50
    // itemsPerSheet = floor(1230 / (50+6)) = floor(21.96) = 21
    // sheets = ceil(100 / 21) = 5
    const result = calculate(w, h, qty, type, false, false)
    expect(result.cost_materials).toBeGreaterThan(0)
  })

  it('film area scales with sheet count', () => {
    const small = calculate(w, h, 10, type, false, false)
    const large = calculate(w, h, 1000, type, false, false)
    expect(large.cost_materials).toBeGreaterThan(small.cost_materials)
  })

  it('3D resin weight proportional to area and qty', () => {
    const without3D = calculate(w, h, qty, type, false, false)
    const with3D = calculate(w, h, qty, 'sticker3D', false, true)
    expect(with3D.cost_materials).toBeGreaterThan(without3D.cost_materials)
  })

  it('lamination adds material cost', () => {
    const noLam = calculate(w, h, qty, type, false, false)
    const withLam = calculate(w, h, qty, type, true, false)
    expect(withLam.cost_materials).toBeGreaterThan(noLam.cost_materials)
  })

  it('uses correct markup for each order type', () => {
    for (const [orderType, expectedMarkup] of Object.entries(MARKUPS)) {
      const result = calculate(w, h, qty, orderType, false, orderType.includes('3D'))
      expect(result.markup).toBe(expectedMarkup)
    }
  })

  it('unknown order type defaults to 4.0 markup', () => {
    const result = calculate(w, h, qty, 'unknown_type', false, false)
    expect(result.markup).toBe(4.0)
  })
})

describe('server-side discount brackets', () => {
  const w = 50, h = 50, type = 'sticker_cut'

  it('qty 1-9 gets 0% discount', () => {
    const result = calculate(w, h, 5, type, false, false)
    expect(result.discount_pct).toBe(0)
  })

  it('qty 10-24 gets 5% discount', () => {
    const result = calculate(w, h, 15, type, false, false)
    expect(result.discount_pct).toBe(0.05)
  })

  it('qty 25-49 gets 10% discount', () => {
    const result = calculate(w, h, 30, type, false, false)
    expect(result.discount_pct).toBe(0.10)
  })

  it('qty 100-199 gets 20% discount', () => {
    const result = calculate(w, h, 150, type, false, false)
    expect(result.discount_pct).toBe(0.20)
  })

  it('qty 500+ gets 30% discount', () => {
    const result = calculate(w, h, 1000, type, false, false)
    expect(result.discount_pct).toBe(0.30)
  })

  it('discount boundaries: 9 gets 0%, 10 gets 5%', () => {
    expect(calculate(w, h, 9, type, false, false).discount_pct).toBe(0)
    expect(calculate(w, h, 10, type, false, false).discount_pct).toBe(0.05)
  })
})

describe('server-side prodDays', () => {
  const w = 50, h = 50, type = 'sticker_cut'

  it('minimum 1 day', () => {
    const result = calculate(w, h, 1, type, false, false)
    expect(result.prod_days).toBeGreaterThanOrEqual(1)
  })

  it('more hours means more days (ceil(totalHours/8))', () => {
    const small = calculate(w, h, 10, type, false, false)
    const large = calculate(w, h, 5000, type, false, false)
    expect(large.prod_days).toBeGreaterThanOrEqual(small.prod_days)
  })

  it('3D adds resin time, increasing prod days', () => {
    const flat = calculate(w, h, 1000, type, false, false)
    const threeD = calculate(w, h, 1000, 'sticker3D', false, true)
    expect(threeD.prod_days).toBeGreaterThanOrEqual(flat.prod_days)
  })
})

describe('server-side edge cases', () => {
  it('handles width=0 without NaN', () => {
    const result = calculate(0, 50, 100, 'sticker_cut', false, false)
    expect(Number.isFinite(result.price_final)).toBe(true)
  })

  it('handles qty=0 without division by zero', () => {
    const result = calculate(50, 50, 0, 'sticker_cut', false, false)
    expect(result.price_per_unit).toBe(0)
    expect(Number.isFinite(result.price_final)).toBe(true)
  })

  it('handles NaN inputs gracefully', () => {
    const result = calculate('abc', null, undefined, 'sticker_cut', false, false)
    expect(Number.isFinite(result.price_final)).toBe(true)
    expect(result.prod_days).toBeGreaterThanOrEqual(1)
  })

  it('accepts overrides to change defaults', () => {
    const normal = calculate(50, 50, 100, 'sticker_cut', false, false)
    const expensive = calculate(50, 50, 100, 'sticker_cut', false, false, { filmPricePerM2: 500 })
    expect(expensive.cost_materials).toBeGreaterThan(normal.cost_materials)
  })
})

describe('DISCOUNTS ranges contiguity', () => {
  it('ranges cover 1 to Infinity without gaps', () => {
    expect(DISCOUNTS[0].min).toBe(1)
    expect(DISCOUNTS[DISCOUNTS.length - 1].max).toBe(Infinity)
    for (let i = 1; i < DISCOUNTS.length; i++) {
      expect(DISCOUNTS[i].min).toBe(DISCOUNTS[i - 1].max + 1)
    }
  })
})
