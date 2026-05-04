import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime, formatPrice, formatNumber, cn } from './utils'

describe('formatDate', () => {
  it('formats a valid date string', () => {
    const result = formatDate('2026-05-05')
    expect(result).toContain('5')
    expect(result).toContain('2026')
  })

  it('formats a Date object', () => {
    const result = formatDate(new Date('2026-01-15'))
    expect(result).toContain('15')
    expect(result).toContain('2026')
  })

  it('returns dash for null', () => {
    expect(formatDate(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatDate(undefined)).toBe('—')
  })

  it('returns dash for empty string', () => {
    expect(formatDate('')).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('includes time in output', () => {
    const result = formatDateTime('2026-05-05T14:30:00')
    expect(result).toContain('14:30')
  })

  it('returns dash for null', () => {
    expect(formatDateTime(null)).toBe('—')
  })
})

describe('formatPrice', () => {
  it('formats positive amount in rubles', () => {
    const result = formatPrice(5000)
    expect(result).toContain('5')
    expect(result).toContain('000')
    // Should contain ruble sign or "₽"
    expect(result).toMatch(/₽|руб/)
  })

  it('formats zero', () => {
    const result = formatPrice(0)
    expect(result).toContain('0')
  })

  it('returns dash for null', () => {
    expect(formatPrice(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatPrice(undefined)).toBe('—')
  })

  it('formats large numbers with space separator', () => {
    const result = formatPrice(1500000)
    // Russian locale uses non-breaking space as thousands separator
    expect(result.replace(/\s/g, '')).toContain('1500000')
  })
})

describe('formatNumber', () => {
  it('formats integer without trailing zeros', () => {
    const result = formatNumber(42)
    expect(result).toBe('42')
  })

  it('formats decimal with specified precision', () => {
    const result = formatNumber(3.14159, 2)
    expect(result).toContain('3,14')
  })

  it('returns dash for null', () => {
    expect(formatNumber(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatNumber(undefined)).toBe('—')
  })

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0')
  })

  it('uses comma as decimal separator (Russian locale)', () => {
    const result = formatNumber(1.5, 1)
    expect(result).toContain(',')
  })
})

describe('cn', () => {
  it('joins class names with space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('filters out falsy values', () => {
    expect(cn('a', false, 'b', null, undefined, '', 'c')).toBe('a b c')
  })

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('')
  })

  it('returns empty string for all falsy', () => {
    expect(cn(false, null, undefined)).toBe('')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const isHidden = false
    expect(cn('base', isActive && 'active', isHidden && 'hidden')).toBe('base active')
  })
})
