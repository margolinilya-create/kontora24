import { describe, it, expect, beforeEach } from 'vitest'
import { usePlanStore } from './plan-store'

describe('usePlanStore', () => {
  beforeEach(() => {
    usePlanStore.getState().reset()
  })

  it('инициализируется пустыми коллекциями и loading=true', () => {
    const s = usePlanStore.getState()
    expect(s.orders).toEqual([])
    expect(s.logs).toEqual([])
    expect(s.items).toEqual([])
    expect(s.overrides).toEqual([])
    expect(s.loading).toBe(true)
    expect(s.dragMode).toBe('cascade')
  })

  it('setOrders / setLogs — массовая загрузка', () => {
    usePlanStore.getState().setOrders([{ id: 'a' }, { id: 'b' }])
    usePlanStore.getState().setLogs([{ id: 'l1' }])
    const s = usePlanStore.getState()
    expect(s.orders).toHaveLength(2)
    expect(s.logs).toHaveLength(1)
  })

  it('upsertOrder добавляет новый и обновляет существующий', () => {
    const { upsertOrder } = usePlanStore.getState()
    upsertOrder({ id: 'a', status: 'new' })
    upsertOrder({ id: 'b', status: 'design' })
    upsertOrder({ id: 'a', status: 'print' }) // обновление
    const orders = usePlanStore.getState().orders
    expect(orders).toHaveLength(2)
    expect(orders.find((o) => o.id === 'a').status).toBe('print')
  })

  it('removeOrder удаляет по id', () => {
    const { setOrders, removeOrder } = usePlanStore.getState()
    setOrders([{ id: 'a' }, { id: 'b' }])
    removeOrder('a')
    expect(usePlanStore.getState().orders).toEqual([{ id: 'b' }])
  })

  it('upsertOverride / removeOverride', () => {
    const { upsertOverride, removeOverride } = usePlanStore.getState()
    upsertOverride({ id: 'ov1', order_id: 'a', stage: 'print', pinned_date: '2026-06-15' })
    expect(usePlanStore.getState().overrides).toHaveLength(1)
    removeOverride('ov1')
    expect(usePlanStore.getState().overrides).toHaveLength(0)
  })

  it('setHydrated переводит loading в false', () => {
    usePlanStore.getState().setHydrated()
    expect(usePlanStore.getState().loading).toBe(false)
    expect(usePlanStore.getState().hydratedAt).toBeGreaterThan(0)
  })

  it('setError выставляет error и сбрасывает loading', () => {
    const err = new Error('boom')
    usePlanStore.getState().setError(err)
    expect(usePlanStore.getState().error).toBe(err)
    expect(usePlanStore.getState().loading).toBe(false)
  })

  it('setDragMode принимает только cascade/this_only', () => {
    const { setDragMode } = usePlanStore.getState()
    setDragMode('this_only')
    expect(usePlanStore.getState().dragMode).toBe('this_only')
    setDragMode('cascade')
    expect(usePlanStore.getState().dragMode).toBe('cascade')
    setDragMode('garbage') // нечто третье → fallback на cascade
    expect(usePlanStore.getState().dragMode).toBe('cascade')
  })

  it('setFilterType / getFilteredOrders', () => {
    const { setOrders, setFilterType, getFilteredOrders } = usePlanStore.getState()
    setOrders([
      { id: 'a', order_type: 'sticker_cut' },
      { id: 'b', order_type: 'stickerpack3D' },
      { id: 'c', order_type: 'sticker_cut' },
    ])
    expect(getFilteredOrders()).toHaveLength(3)
    setFilterType('sticker_cut')
    expect(getFilteredOrders().map((o) => o.id)).toEqual(['a', 'c'])
    setFilterType(null)
    expect(getFilteredOrders()).toHaveLength(3)
  })

  it('reset возвращает к дефолтному состоянию', () => {
    const { setOrders, setHydrated, setSelectedOrderId, reset } = usePlanStore.getState()
    setOrders([{ id: 'a' }])
    setSelectedOrderId('a')
    setHydrated()
    reset()
    const s = usePlanStore.getState()
    expect(s.orders).toEqual([])
    expect(s.selectedOrderId).toBeNull()
    expect(s.loading).toBe(true)
  })
})
