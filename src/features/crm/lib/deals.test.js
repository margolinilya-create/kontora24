import { describe, it, expect } from 'vitest'
import {
  activeStages, groupDealsByStage, stageTotals, daysInStage, isRotting, isOverdue,
  weightedForecast, needsLostReason, orderPrefillFromDeal,
} from './deals'

const stages = [
  { id: 's2', sort: 2, kind: 'open', probability: 50, rot_days: 3 },
  { id: 's1', sort: 1, kind: 'open', probability: 10, rot_days: null },
  { id: 'won', sort: 3, kind: 'won', probability: 100 },
  { id: 'old', sort: 4, kind: 'open', archived_at: '2026-01-01' },
]
const byId = Object.fromEntries(stages.map((s) => [s.id, s]))
const now = new Date('2026-11-25T12:00:00Z')

describe('activeStages', () => {
  it('сортирует и убирает архивные', () => {
    expect(activeStages(stages).map((s) => s.id)).toEqual(['s1', 's2', 'won'])
  })
})

describe('groupDealsByStage / stageTotals', () => {
  it('раскладывает по этапам, свежие сверху, неизвестный этап игнорирует', () => {
    const g = groupDealsByStage([
      { id: 'a', stage_id: 's1', amount: 100, updated_at: '2026-11-01' },
      { id: 'b', stage_id: 's1', amount: '50', updated_at: '2026-11-20' },
      { id: 'c', stage_id: 'nope' },
    ], activeStages(stages))
    expect(g.s1.map((d) => d.id)).toEqual(['b', 'a'])
    expect(g.s2).toEqual([])
    expect(stageTotals(g.s1)).toEqual({ count: 2, sum: 150 })
    expect(stageTotals(null)).toEqual({ count: 0, sum: 0 })
  })
})

describe('daysInStage / isRotting / isOverdue', () => {
  const deal = { stage_changed_at: '2026-11-20T12:00:00Z', expected_close: '2026-11-24' }
  it('дни на этапе', () => {
    expect(daysInStage(deal, now)).toBe(5)
    expect(daysInStage({}, now)).toBe(0)
  })
  it('залежалась только на открытом этапе с лимитом', () => {
    expect(isRotting(deal, byId.s2, now)).toBe(true)
    expect(isRotting(deal, byId.s1, now)).toBe(false)
    expect(isRotting(deal, byId.won, now)).toBe(false)
  })
  it('просрочка ожидаемой даты', () => {
    expect(isOverdue(deal, byId.s1, now)).toBe(true)
    expect(isOverdue(deal, byId.won, now)).toBe(false)
    expect(isOverdue({ expected_close: '2026-11-25' }, byId.s1, now)).toBe(false)
  })
})

describe('weightedForecast', () => {
  it('сумма × вероятность только по открытым', () => {
    expect(weightedForecast([
      { stage_id: 's1', amount: 1000 },
      { stage_id: 's2', amount: 2000 },
      { stage_id: 'won', amount: 5000 },
    ], byId)).toBe(1100)
  })
})

describe('needsLostReason', () => {
  it('только для lost', () => {
    expect(needsLostReason({ kind: 'lost' })).toBe(true)
    expect(needsLostReason({ kind: 'won' })).toBe(false)
    expect(needsLostReason(null)).toBe(false)
  })
})

describe('orderPrefillFromDeal', () => {
  it('переносит название, клиента, сумму, срок, источник', () => {
    expect(orderPrefillFromDeal({
      title: 'Стикеры для кафе', client: { name: 'ООО Ромашка' }, amount: '15000.00',
      expected_close: '2026-12-10', source: 'avito',
    })).toEqual({
      deal_name: 'Стикеры для кафе', client_name: 'ООО Ромашка', price_final: '15000',
      deadline: '2026-12-10', source: 'avito',
    })
  })
  it('пустые поля не переносит', () => {
    expect(orderPrefillFromDeal({ title: 'X', amount: 0 })).toEqual({ deal_name: 'X' })
    expect(orderPrefillFromDeal(null)).toEqual({})
  })
})

import { dealsInPeriod, summarizeSales, buildFunnel, groupDeals, forecastByMonth } from './deals'

describe('R28.4 аналитика продаж', () => {
  const st = [
    { id: 's1', name: 'Новая', sort: 1, kind: 'open', probability: 10 },
    { id: 's2', name: 'КП', sort: 2, kind: 'open', probability: 50 },
    { id: 'w', name: 'Выиграна', sort: 5, kind: 'won', probability: 100 },
    { id: 'l', name: 'Проиграна', sort: 6, kind: 'lost', probability: 0 },
  ]
  const ids = Object.fromEntries(st.map((s) => [s.id, s]))
  const ds = [
    { id: 'a', stage_id: 's1', amount: 1000, created_at: '2026-11-01T00:00:00Z', expected_close: '2026-12-10' },
    { id: 'b', stage_id: 's2', amount: 2000, created_at: '2026-11-02T00:00:00Z', expected_close: '2026-12-20', source: 'avito' },
    { id: 'c', stage_id: 'w', amount: 3000, created_at: '2026-11-01T00:00:00Z', closed_at: '2026-11-11T00:00:00Z', source: 'avito' },
    { id: 'd', stage_id: 'l', amount: 500, created_at: '2026-11-03T00:00:00Z' },
    { id: 'e', stage_id: 's1', amount: 100, created_at: '2025-01-01T00:00:00Z', archived_at: 'x' },
  ]
  it('период и сводка', () => {
    expect(dealsInPeriod(ds, '2026-11-01T12:00:00Z', null).map((d) => d.id)).toEqual(['b', 'd'])
    expect(summarizeSales(dealsInPeriod(ds), ids)).toMatchObject({ created: 4, won: 1, wonSum: 3000, lost: 1, open: 2, winRate: 50, avgWon: 3000, avgCycleDays: 10 })
  })
  it('воронка учитывает пройденные этапы', () => {
    const f = buildFunnel(dealsInPeriod(ds), st, [{ deal_id: 'd', meta: { from: 'КП', to: 'Проиграна' } }])
    expect(f.map((x) => [x.name, x.count, x.pct])).toEqual([['Новая', 4, 100], ['КП', 3, 75]])
  })
  it('группировка по источнику', () => {
    expect(groupDeals(dealsInPeriod(ds), ids, (d) => d.source, (k) => k).find((r) => r.key === 'avito')).toMatchObject({ key: 'avito', count: 2, won: 1, wonSum: 3000 })
  })
  it('прогноз по месяцам', () => {
    expect(forecastByMonth(ds, ids, new Date('2026-12-15T00:00:00Z'))).toEqual([{ month: '2026-12', count: 2, sum: 3000, weighted: 1100, overdue: false }])
    expect(forecastByMonth(ds, ids, new Date('2027-02-01T00:00:00Z'))[0].overdue).toBe(true)
  })
})
