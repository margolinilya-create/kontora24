// R12.2 — состояние планировщика. Zustand-стор. Все данные
// (заказы / логи / items / overrides / settings) хранятся здесь,
// расчёт расписания делается через useScheduleResult() (мемо в хуке).
//
// Никакого вызова schedule() напрямую внутри стора — стор только
// «склад данных», чтобы любой компонент мог дешёвую подписаться через
// useStore(state => state.field) без перерисовки на каждый чих.

import { create } from 'zustand'

const DEFAULT_STATE = {
  // Данные из БД
  orders: [],
  logs: [],
  items: [],
  overrides: [],
  norms: null,
  capacity: null,
  holidays: [],

  // UI-состояние
  selectedOrderId: null,
  dragMode: 'cascade',   // 'cascade' | 'this_only'
  filterType: null,       // null | order_type для фильтра
  today: null,            // Date | null (для тестов фиксируется явно)

  // Жизненный цикл
  loading: true,
  error: null,
  hydratedAt: null,       // ts последней первичной загрузки
}

function upsertById(list, row) {
  const idx = list.findIndex((x) => x.id === row.id)
  if (idx < 0) return [...list, row]
  const next = [...list]
  next[idx] = { ...next[idx], ...row }
  return next
}

function removeById(list, id) {
  return list.filter((x) => x.id !== id)
}

export const usePlanStore = create((set, get) => ({
  ...DEFAULT_STATE,

  // ============================================================
  // Сеттеры массовых данных (используются при первичной загрузке)
  // ============================================================
  setOrders: (orders) => set({ orders: orders || [] }),
  setLogs: (logs) => set({ logs: logs || [] }),
  setItems: (items) => set({ items: items || [] }),
  setOverrides: (overrides) => set({ overrides: overrides || [] }),
  setNorms: (norms) => set({ norms: norms || null }),
  setCapacity: (capacity) => set({ capacity: capacity || null }),
  setHolidays: (holidays) => set({ holidays: holidays || [] }),

  setHydrated: () => set({ loading: false, error: null, hydratedAt: Date.now() }),
  setError: (error) => set({ error, loading: false }),
  setLoading: (loading) => set({ loading: !!loading }),

  // ============================================================
  // Точечные мутации (используются при realtime событиях)
  // ============================================================
  upsertOrder: (order) => set((s) => ({ orders: upsertById(s.orders, order) })),
  removeOrder: (id) => set((s) => ({ orders: removeById(s.orders, id) })),

  upsertLog: (log) => set((s) => ({ logs: upsertById(s.logs, log) })),
  removeLog: (id) => set((s) => ({ logs: removeById(s.logs, id) })),

  upsertItem: (item) => set((s) => ({ items: upsertById(s.items, item) })),
  removeItem: (id) => set((s) => ({ items: removeById(s.items, id) })),

  upsertOverride: (override) => set((s) => ({ overrides: upsertById(s.overrides, override) })),
  removeOverride: (id) => set((s) => ({ overrides: removeById(s.overrides, id) })),

  // ============================================================
  // UI-состояние
  // ============================================================
  setSelectedOrderId: (id) => set({ selectedOrderId: id }),
  setDragMode: (mode) => set({ dragMode: mode === 'this_only' ? 'this_only' : 'cascade' }),
  setFilterType: (orderType) => set({ filterType: orderType || null }),
  setToday: (date) => set({ today: date instanceof Date ? date : null }),

  // Сброс — используется при логауте или unmount планировщика.
  reset: () => set({ ...DEFAULT_STATE }),

  // Геттер с фильтрацией — удобно для компонентов и тестов.
  getFilteredOrders: () => {
    const { orders, filterType } = get()
    if (!filterType) return orders
    return orders.filter((o) => o.order_type === filterType)
  },
}))
