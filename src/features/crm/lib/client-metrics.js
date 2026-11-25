// R28.0 — метрики клиента по его заказам (чистая функция).
// Заказы читаются из k24_orders_full: price_final = NULL без view:finance —
// тогда денежные метрики тоже null (UI их не показывает).

export const SLEEPING_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * @param {Array<{created_at: string, status: string, price_final?: number|null}>} orders
 * @param {{ now?: Date, sleepingDays?: number }} [opts]
 */
export function computeClientMetrics(orders, opts = {}) {
  const now = opts.now ?? new Date()
  const sleepingDays = opts.sleepingDays ?? SLEEPING_DAYS
  const active = (orders || []).filter((o) => o && o.status !== 'cancelled')

  let lastOrderAt = null
  let firstOrderAt = null
  let ltv = 0
  let pricedCount = 0
  for (const o of active) {
    const d = o.created_at ? new Date(o.created_at) : null
    if (d && !Number.isNaN(d.getTime())) {
      if (!lastOrderAt || d > lastOrderAt) lastOrderAt = d
      if (!firstOrderAt || d < firstOrderAt) firstOrderAt = d
    }
    if (o.price_final != null && Number.isFinite(Number(o.price_final))) {
      ltv += Number(o.price_final)
      pricedCount += 1
    }
  }

  const daysSinceLast = lastOrderAt ? Math.floor((now - lastOrderAt) / DAY_MS) : null
  return {
    ordersCount: active.length,
    inProgress: active.filter((o) => o.status !== 'done').length,
    ltv: pricedCount ? ltv : null,
    avgCheck: pricedCount ? Math.round(ltv / pricedCount) : null,
    firstOrderAt: firstOrderAt ? firstOrderAt.toISOString() : null,
    lastOrderAt: lastOrderAt ? lastOrderAt.toISOString() : null,
    daysSinceLast,
    isSleeping: daysSinceLast != null && daysSinceLast > sleepingDays,
  }
}

/** Отображаемое имя контакта. */
export function contactFullName(contact) {
  if (!contact) return ''
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim()
}
