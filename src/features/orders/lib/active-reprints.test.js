import { describe, it, expect } from 'vitest'
import {
  reprintDisplayTitle, matchesReprintFilters, interleaveReprints,
  countActiveReprintsByOrder, groupReprintsByStatus, formatColumnCount,
  reprintTabBadge, reprintToCalendarItem,
} from './active-reprints'
import { getReprintRollbackTargets } from '@/features/production/lib/production-logs'

const order371 = { id: 'o371', number: 371, custom_number: null, deadline: '2026-11-20', client: { name: 'ООО Ромашка' } }
const order372 = { id: 'o372', number: 372, custom_number: 'A-15', deadline: '2026-11-25', client: { name: 'Пинхед' } }

const rep = (over) => ({ id: 'r1', status: 'cutting', qty: 50, item_idx: 1, title: null, order: order371, ...over })

describe('reprintDisplayTitle', () => {
  it('по умолчанию — «Допечатка #N к заказу #M»', () => {
    expect(reprintDisplayTitle(rep(), '371')).toBe('Допечатка #1 к заказу #371')
  })
  it('переименованная — своё название', () => {
    expect(reprintDisplayTitle(rep({ title: 'Срочно фоны' }), '371')).toBe('Срочно фоны')
  })
})

describe('matchesReprintFilters', () => {
  it('без фильтров — подходит', () => {
    expect(matchesReprintFilters(rep())).toBe(true)
  })
  it('фильтр этапа — по собственному этапу допечатки', () => {
    expect(matchesReprintFilters(rep(), { statuses: ['cutting'] })).toBe(true)
    expect(matchesReprintFilters(rep(), { statuses: ['otk'] })).toBe(false)
  })
  it('срок — по сроку родителя', () => {
    expect(matchesReprintFilters(rep(), { deadlineFrom: '2026-11-21' })).toBe(false)
    expect(matchesReprintFilters(rep(), { deadlineTo: '2026-11-20' })).toBe(true)
  })
  it('поиск по номеру, произвольному номеру, клиенту, названию', () => {
    expect(matchesReprintFilters(rep(), { search: '371' })).toBe(true)
    expect(matchesReprintFilters(rep(), { search: 'ромаш' })).toBe(true)
    expect(matchesReprintFilters(rep({ order: order372 }), { search: 'a-15' })).toBe(true)
    expect(matchesReprintFilters(rep({ title: 'Фоны заново' }), { search: 'фоны' })).toBe(true)
    expect(matchesReprintFilters(rep(), { search: 'нет такого' })).toBe(false)
  })
})

describe('interleaveReprints', () => {
  it('допечатка сразу после родителя', () => {
    const out = interleaveReprints([order371, order372], [rep({ id: 'a', item_idx: 2 }), rep({ id: 'b', item_idx: 1 })])
    expect(out.map((x) => x.kind === 'order' ? x.order.id : x.reprint.id)).toEqual(['o371', 'b', 'a', 'o372'])
  })
  it('родитель скрыт — допечатка в хвосте (includeOrphans)', () => {
    const out = interleaveReprints([order372], [rep()])
    expect(out.map((x) => x.kind)).toEqual(['order', 'reprint'])
    expect(interleaveReprints([order372], [rep()], { includeOrphans: false })).toHaveLength(1)
  })
})

describe('счётчики', () => {
  it('countActiveReprintsByOrder считает только незавершённые', () => {
    const m = countActiveReprintsByOrder([rep({ id: '1' }), rep({ id: '2', status: 'done' }), rep({ id: '3', order: order372 })])
    expect(m).toEqual({ o371: 1, o372: 1 })
  })
  it('groupReprintsByStatus', () => {
    const g = groupReprintsByStatus([rep({ id: '1' }), rep({ id: '2', status: 'print' })])
    expect(Object.keys(g).sort()).toEqual(['cutting', 'print'])
  })
  it('formatColumnCount: «12 + 2 доп.»', () => {
    expect(formatColumnCount(12, 2)).toBe('12 + 2 доп.')
    expect(formatColumnCount(12, 0)).toBe('12')
  })
  it('reprintTabBadge: акцент/серый/нет', () => {
    expect(reprintTabBadge([])).toBeNull()
    expect(reprintTabBadge([{ status: 'print' }, { status: 'done' }])).toEqual({ count: 1, tone: 'accent' })
    expect(reprintTabBadge([{ status: 'done' }, { status: 'done' }])).toEqual({ count: 2, tone: 'muted' })
  })
})

describe('reprintToCalendarItem', () => {
  it('срок родителя, этап и тираж допечатки, ссылка на подзадачу', () => {
    const c = reprintToCalendarItem(rep())
    expect(c).toMatchObject({ isReprint: true, deadline: '2026-11-20', status: 'cutting', qty: 50, href: '/production/subtask/r1', number: 371 })
  })
})

describe('getReprintRollbackTargets', () => {
  const route = ['print', 'lamination', 'cutting', 'packaging', 'done']
  it('только пройденные этапы маршрута', () => {
    expect(getReprintRollbackTargets({ status: 'packaging', route })).toEqual(['print', 'lamination', 'cutting'])
  })
  it('завершённая — все производственные этапы', () => {
    expect(getReprintRollbackTargets({ status: 'done', route })).toEqual(['print', 'lamination', 'cutting', 'packaging'])
  })
  it('первый этап / нет маршрута — пусто', () => {
    expect(getReprintRollbackTargets({ status: 'print', route })).toEqual([])
    expect(getReprintRollbackTargets({ status: 'cutting', route: null })).toEqual([])
    expect(getReprintRollbackTargets({ status: 'otk', route })).toEqual([])
  })
})
