import { describe, it, expect } from 'vitest'
import { formatElapsed, formatTotalTime } from './useTimer'

describe('formatElapsed', () => {
  it('formats seconds under a minute', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(30)).toBe('0:30')
    expect(formatElapsed(59)).toBe('0:59')
  })

  it('formats minutes', () => {
    expect(formatElapsed(60)).toBe('1:00')
    expect(formatElapsed(90)).toBe('1:30')
    expect(formatElapsed(600)).toBe('10:00')
  })

  it('formats hours', () => {
    expect(formatElapsed(3600)).toBe('1:00:00')
    expect(formatElapsed(3661)).toBe('1:01:01')
    expect(formatElapsed(7200)).toBe('2:00:00')
  })
})

describe('formatTotalTime', () => {
  it('formats zero', () => {
    expect(formatTotalTime(0)).toBe('0 мин')
    expect(formatTotalTime(null)).toBe('0 мин')
    expect(formatTotalTime(undefined)).toBe('0 мин')
  })

  it('formats minutes only', () => {
    expect(formatTotalTime(30)).toBe('30 мин')
    expect(formatTotalTime(59)).toBe('59 мин')
  })

  it('formats hours and minutes', () => {
    expect(formatTotalTime(60)).toBe('1 ч 0 мин')
    expect(formatTotalTime(90)).toBe('1 ч 30 мин')
    expect(formatTotalTime(150)).toBe('2 ч 30 мин')
  })
})
