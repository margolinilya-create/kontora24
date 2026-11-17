import { describe, it, expect } from 'vitest'
import { JOURNAL_SORTS, CONSUMPTION_KINDS, isConsumptionOperation } from './warehouse-journal'

describe('JOURNAL_SORTS — стабильная пагинация', () => {
  it('каждая сортировка заканчивается уникальным id', () => {
    for (const [key, cols] of Object.entries(JOURNAL_SORTS)) {
      expect(cols[cols.length - 1][0], key).toBe('id')
    }
  })
})

describe('расход материала по виду операции', () => {
  it('расход — только списание на заказ и ручной расход', () => {
    expect(CONSUMPTION_KINDS).toEqual(['order_consumption', 'manual_consumption'])
    expect(isConsumptionOperation({ kind: 'order_consumption', delta: -2 })).toBe(true)
    expect(isConsumptionOperation({ kind: 'manual_consumption', delta: -1 })).toBe(true)
  })
  it('инвентаризация/корректировка/приход — не расход', () => {
    expect(isConsumptionOperation({ kind: 'inventory', delta: -5 })).toBe(false)
    expect(isConsumptionOperation({ kind: 'correction', delta: -5 })).toBe(false)
    expect(isConsumptionOperation({ kind: 'purchase', delta: 5 })).toBe(false)
    expect(isConsumptionOperation({ kind: 'order_consumption', delta: 3 })).toBe(false)
  })
})
