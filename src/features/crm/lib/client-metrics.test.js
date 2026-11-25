import { describe, it, expect } from 'vitest'
import { computeClientMetrics, contactFullName } from './client-metrics'

const now = new Date('2026-11-25T12:00:00Z')

describe('computeClientMetrics', () => {
  it('пустой список', () => {
    expect(computeClientMetrics([], { now })).toEqual({
      ordersCount: 0, inProgress: 0, ltv: null, avgCheck: null,
      firstOrderAt: null, lastOrderAt: null, daysSinceLast: null, isSleeping: false,
    })
  })

  it('считает LTV, средний чек, даты; отменённые не учитываются', () => {
    const m = computeClientMetrics([
      { created_at: '2026-10-01T00:00:00Z', status: 'done', price_final: 10000 },
      { created_at: '2026-11-20T00:00:00Z', status: 'print', price_final: 5000 },
      { created_at: '2026-11-21T00:00:00Z', status: 'cancelled', price_final: 99999 },
    ], { now })
    expect(m.ordersCount).toBe(2)
    expect(m.inProgress).toBe(1)
    expect(m.ltv).toBe(15000)
    expect(m.avgCheck).toBe(7500)
    expect(m.firstOrderAt).toBe('2026-10-01T00:00:00.000Z')
    expect(m.lastOrderAt).toBe('2026-11-20T00:00:00.000Z')
    expect(m.daysSinceLast).toBe(5)
    expect(m.isSleeping).toBe(false)
  })

  it('без права на финансы (price_final=null) — денежные метрики null', () => {
    const m = computeClientMetrics([
      { created_at: '2026-01-01T00:00:00Z', status: 'done', price_final: null },
    ], { now })
    expect(m.ltv).toBeNull()
    expect(m.avgCheck).toBeNull()
    expect(m.ordersCount).toBe(1)
    expect(m.isSleeping).toBe(true)
  })

  it('порог «спящего» настраивается', () => {
    const m = computeClientMetrics([{ created_at: '2026-11-01T00:00:00Z', status: 'done' }], { now, sleepingDays: 10 })
    expect(m.isSleeping).toBe(true)
  })
})

describe('contactFullName', () => {
  it('склеивает имя и фамилию', () => {
    expect(contactFullName({ first_name: 'Иван', last_name: 'Петров' })).toBe('Иван Петров')
    expect(contactFullName({ first_name: 'Иван', last_name: null })).toBe('Иван')
    expect(contactFullName(null)).toBe('')
  })
})
