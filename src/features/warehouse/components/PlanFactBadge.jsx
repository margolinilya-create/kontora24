import { useState, useRef } from 'react'
import { formatNumber } from '@/shared/lib/utils'

/**
 * R13.1 (бриф 02.06): показывает «План трат» зелёным рядом с фактом склада.
 * Tooltip раскрывает из каких N заказов сложилось это число.
 *
 * Если plannedInfo пустой/нулевой — компонент не рендерит ничего.
 */
export function PlanFactBadge({ plannedInfo, unit }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef(null)

  if (!plannedInfo || !(plannedInfo.planned > 0)) return null

  const list = plannedInfo.orders || []
  const sumByOrder = new Map()
  for (const o of list) {
    const prev = sumByOrder.get(o.id) || { id: o.id, number: o.number, qty: 0 }
    prev.qty += Number(o.qty) || 0
    sumByOrder.set(o.id, prev)
  }
  const aggregated = Array.from(sumByOrder.values()).sort((a, b) => b.qty - a.qty)

  function handleEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  function handleLeave() {
    closeTimer.current = setTimeout(() => setOpen(false), 100)
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <span
        role="button"
        tabIndex={0}
        onFocus={handleEnter}
        onBlur={handleLeave}
        className="inline-flex items-baseline gap-1 text-xs font-medium text-success cursor-help"
      >
        <span aria-hidden="true">▼</span>
        <span>{formatNumber(plannedInfo.planned, 1)}</span>
        <span className="opacity-70">{unit}</span>
      </span>
      {open && (
        <div className="absolute z-30 top-full right-0 mt-1 min-w-[200px] max-h-64 overflow-y-auto rounded-xl border border-border bg-surface shadow-xl p-3 text-xs">
          <p className="font-medium mb-2 text-text">
            План трат — {aggregated.length} {pluralOrders(aggregated.length)}
          </p>
          <ul className="space-y-1">
            {aggregated.slice(0, 30).map((o) => (
              <li key={o.id} className="flex justify-between gap-3">
                <span className="text-text-muted">#{o.number}</span>
                <span className="tabular-nums">{formatNumber(o.qty, 1)} {unit}</span>
              </li>
            ))}
            {aggregated.length > 30 && (
              <li className="text-text-muted/60 text-center pt-1">… ещё {aggregated.length - 30}</li>
            )}
          </ul>
        </div>
      )}
    </span>
  )
}

function pluralOrders(n) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'заказ'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'заказа'
  return 'заказов'
}
