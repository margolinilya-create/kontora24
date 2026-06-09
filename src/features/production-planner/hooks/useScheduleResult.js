// R12.2 — мемоизированный пересчёт расписания из стора. Компоненты
// должны использовать ЭТОТ хук, а не вызывать schedule() напрямую,
// иначе планирование пересчитается на каждый рендер.

import { useMemo } from 'react'
import { usePlanStore } from '../store/plan-store'
import { schedule } from '../lib/planner'

export function useScheduleResult({ horizonDays = 30 } = {}) {
  const orders = usePlanStore((s) => s.orders)
  const items = usePlanStore((s) => s.items)
  const overrides = usePlanStore((s) => s.overrides)
  const norms = usePlanStore((s) => s.norms)
  const capacity = usePlanStore((s) => s.capacity)
  const holidays = usePlanStore((s) => s.holidays)
  const filterType = usePlanStore((s) => s.filterType)
  const today = usePlanStore((s) => s.today)
  // R17.3 (бриф 5.06): горизонт планирования из store (1/2/3 мес.).
  const horizonOverride = usePlanStore((s) => s.horizonDays)

  return useMemo(() => {
    const filtered = filterType ? orders.filter((o) => o.order_type === filterType) : orders
    return schedule({
      orders: filtered,
      items,
      overrides,
      norms,
      capacity,
      holidays,
      today: today || new Date(),
      horizonDays: horizonOverride || horizonDays,
    })
  }, [orders, items, overrides, norms, capacity, holidays, filterType, today, horizonDays, horizonOverride])
}
