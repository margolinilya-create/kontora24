import { describe, it, expect } from 'vitest'
import {
  buildFeed, filterFeed, taskBucket, sortOpenTasks, dealsWithoutNextStep, dueForReminder,
  localInputToIso, defaultDueInput,
} from './feed'

const now = new Date('2026-11-25T12:00:00')

describe('buildFeed / filterFeed', () => {
  const feed = buildFeed({
    notes: [
      { id: 'n1', created_at: '2026-11-20T10:00:00Z', pinned: false },
      { id: 'n2', created_at: '2026-11-01T10:00:00Z', pinned: true },
    ],
    tasks: [{ id: 't1', created_at: '2026-11-21T10:00:00Z', done_at: '2026-11-24T10:00:00Z' }],
    activities: [{ id: 'a1', occurred_at: '2026-11-22T10:00:00Z' }],
    statusHistory: [{ id: 'h1', order_id: 'o1', created_at: '2026-11-23T10:00:00Z' }],
    ordersById: { o1: { id: 'o1', number: 7 } },
  })

  it('закреплённые сверху, затем по времени', () => {
    expect(feed.map((i) => i.key)).toEqual(['n:n2', 't:t1', 'h:h1', 'a:a1', 'n:n1'])
  })
  it('заказ подтягивается к записи истории', () => {
    expect(feed.find((i) => i.key === 'h:h1').data.order.number).toBe(7)
  })
  it('фильтр по типу', () => {
    expect(filterFeed(feed, 'note').map((i) => i.key)).toEqual(['n:n2', 'n:n1'])
    expect(filterFeed(feed, 'all')).toHaveLength(5)
  })
  it('пустой ввод', () => {
    expect(buildFeed()).toEqual([])
  })
})

describe('taskBucket / sortOpenTasks', () => {
  it('корзины', () => {
    expect(taskBucket({ due_at: '2026-11-24T09:00:00' }, now)).toBe('overdue')
    expect(taskBucket({ due_at: '2026-11-25T09:00:00' }, now)).toBe('overdue')
    expect(taskBucket({ due_at: '2026-11-25T18:00:00' }, now)).toBe('today')
    expect(taskBucket({ due_at: '2026-11-26T09:00:00' }, now)).toBe('upcoming')
    expect(taskBucket({}, now)).toBe('nodate')
    expect(taskBucket({ done_at: 'x', due_at: '2026-11-01' }, now)).toBe('done')
  })
  it('порядок: просроченные → сегодня → будущие → без срока, выполненные убраны', () => {
    const sorted = sortOpenTasks([
      { id: 'nodate' },
      { id: 'up', due_at: '2026-11-27T09:00:00' },
      { id: 'today', due_at: '2026-11-25T18:00:00' },
      { id: 'over', due_at: '2026-11-20T09:00:00' },
      { id: 'done', done_at: 'x' },
    ], now)
    expect(sorted.map((t) => t.id)).toEqual(['over', 'today', 'up', 'nodate'])
  })
})

describe('dealsWithoutNextStep', () => {
  it('только открытые, не в архиве, без открытой задачи', () => {
    const stagesById = { o: { kind: 'open' }, w: { kind: 'won' } }
    const deals = [
      { id: 'd1', stage_id: 'o' },
      { id: 'd2', stage_id: 'o' },
      { id: 'd3', stage_id: 'w' },
      { id: 'd4', stage_id: 'o', archived_at: 'x' },
    ]
    expect(dealsWithoutNextStep(deals, ['d2'], stagesById).map((d) => d.id)).toEqual(['d1'])
  })
})

describe('dueForReminder', () => {
  it('наступившие, не выполненные, ещё не напомненные', () => {
    const tasks = [
      { id: 'a', due_at: '2026-11-25T11:00:00' },
      { id: 'b', due_at: '2026-11-25T13:00:00' },
      { id: 'c', due_at: '2026-11-25T10:00:00', done_at: 'x' },
      { id: 'd', due_at: '2026-11-25T09:00:00' },
    ]
    expect(dueForReminder(tasks, ['d'], now).map((t) => t.id)).toEqual(['a'])
  })
})

describe('datetime helpers', () => {
  it('localInputToIso', () => {
    expect(localInputToIso('')).toBeNull()
    expect(localInputToIso('нет')).toBeNull()
    expect(localInputToIso('2026-11-25T15:00')).toBe(new Date('2026-11-25T15:00').toISOString())
  })
  it('defaultDueInput — через 2 часа, ровный час', () => {
    expect(defaultDueInput(new Date('2026-11-25T12:34:00'))).toBe('2026-11-25T14:00')
  })
})
