import { describe, it, expect } from 'vitest'
import { validateOrderSize, planManualStatusChange, patchNeedsRefetch, getColorApprovalNext } from './order-edit'
import { makeOrderSchema } from './order-schema'
import { selectPageReprints, parentMatchesOrderFilters } from './active-reprints'

const V1 = { order_type: 'sticker_cut', design_status: 'needs_development', need_lam: true, bopp_bag: true }

describe('validateOrderSize (ревью R25 п.6)', () => {
  it('тираж и размер — не меньше 1', () => {
    expect(validateOrderSize({ qty: '10', width_mm: '50', height_mm: '50' })).toBeNull()
    expect(validateOrderSize({ qty: '', width_mm: '50', height_mm: '50' })).toMatch(/Тираж/)
    expect(validateOrderSize({ qty: '0', width_mm: '50', height_mm: '50' })).toMatch(/Тираж/)
    expect(validateOrderSize({ qty: '2.5', width_mm: '50', height_mm: '50' })).toMatch(/Тираж/)
    expect(validateOrderSize({ qty: '5', width_mm: '-1', height_mm: '50' })).toMatch(/Ширина/)
    expect(validateOrderSize({ qty: '5', width_mm: '50', height_mm: null })).toMatch(/Длина/)
  })
})

describe('planManualStatusChange (ревью R25 п.1)', () => {
  it('назад — откат', () => {
    expect(planManualStatusChange(V1, 'cutting', 'print')).toEqual({ isRollback: true, kind: 'rollback' })
  })
  it('вперёд — force + manual_skip с перечнем пропущенных', () => {
    const plan = planManualStatusChange(V1, 'print', 'packaging')
    expect(plan).toMatchObject({ force: true, kind: 'manual_skip' })
    expect(plan.note).toMatch(/Ламинация/)
    expect(plan.note).toMatch(/Резка/)
  })
  it('цель вне маршрута — force', () => {
    expect(planManualStatusChange(V1, 'print', 'cancelled')).toMatchObject({ force: true, kind: 'manual_skip' })
  })
})

describe('patchNeedsRefetch (ревью R25 п.5)', () => {
  const prev = { order_type: 'sticker_cut', need_lam: true, notes: 'a' }
  it('поля маршрута → refetch', () => {
    expect(patchNeedsRefetch(prev, { order_type: 'sticker3D' })).toBe(true)
    expect(patchNeedsRefetch(prev, { need_lam: false })).toBe(true)
  })
  it('прочие поля или без изменений → без refetch', () => {
    expect(patchNeedsRefetch(prev, { notes: 'b', need_lam: true, order_type: 'sticker_cut' })).toBe(false)
  })
})

describe('getColorApprovalNext (ревью R25 п.12a)', () => {
  it('следующий этап маршрута после согласования цвета', () => {
    expect(getColorApprovalNext(V1)).toBe('prepress')
  })
})

describe('makeOrderSchema (ревью R25 п.8)', () => {
  const base = {
    order_type: 'sticker_cut', qty: '10', width_mm: '50', height_mm: '50',
    client_name: 'Клиент', deadline: '2026-12-01',
  }
  it('с правом на финансы цена обязательна', () => {
    const r = makeOrderSchema({ requirePrice: true }).safeParse({ ...base, price_final: '' })
    expect(r.success).toBe(false)
    expect(r.error.issues.some((i) => i.path[0] === 'price_final')).toBe(true)
  })
  it('без права цена не требуется', () => {
    const r = makeOrderSchema({ requirePrice: false }).safeParse({ ...base, price_final: '' })
    expect(r.success).toBe(true)
    expect(r.data.price_final).toBeUndefined()
  })
  it('цена приводится к числу и должна быть > 0', () => {
    expect(makeOrderSchema().safeParse({ ...base, price_final: '1500' }).data.price_final).toBe(1500)
    expect(makeOrderSchema().safeParse({ ...base, price_final: '0' }).success).toBe(false)
  })
})

describe('selectPageReprints (ревью R25 п.18)', () => {
  const filters = { statuses: ['print', 'cutting'] }
  const parentOnPage2 = { id: 'o2', status: 'print', number: 2 }
  const parentHidden = { id: 'o3', status: 'otk', number: 3 }
  const reprints = [
    { id: 'r1', status: 'print', order: { id: 'o1', status: 'print', number: 1 } },
    { id: 'r2', status: 'cutting', order: parentOnPage2 },
    { id: 'r3', status: 'print', order: parentHidden },
  ]
  it('первая страница: рядом с родителем + сироты, без чужих родителей', () => {
    const ids = selectPageReprints(reprints, [{ id: 'o1' }], { isFirstPage: true, filters }).map((r) => r.id)
    expect(ids).toEqual(['r1', 'r3'])
  })
  it('вторая страница: только рядом с родителем', () => {
    const ids = selectPageReprints(reprints, [{ id: 'o2' }], { isFirstPage: false, filters }).map((r) => r.id)
    expect(ids).toEqual(['r2'])
  })
  it('parentMatchesOrderFilters учитывает поиск', () => {
    expect(parentMatchesOrderFilters({ status: 'print', number: 12, client: { name: 'Ромашка' } }, { search: 'ромаш' })).toBe(true)
    expect(parentMatchesOrderFilters({ status: 'print', number: 12 }, { search: 'xyz' })).toBe(false)
  })
})
