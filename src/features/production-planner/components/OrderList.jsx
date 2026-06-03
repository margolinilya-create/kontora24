// R12.3 — список заказов (слева). Карточка с цветной меткой, номером,
// бейджем СРОЧНО, статусом «в срок/впритык/просрочен», текущим этапом
// и менеджерским сроком (золотой пилл).

import { formatOrderNumber } from '@/shared/lib/utils'
import { ORDER_STATUSES, ORDER_TYPES } from '@/shared/constants'
import { usePlanStore } from '../store/plan-store'
import { useScheduleResult } from '../hooks/useScheduleResult'
import { getOrderPalette } from '../lib/order-colors'

function daysBetween(aIso, bIso) {
  if (!aIso || !bIso) return 0
  const a = new Date(`${aIso}T00:00:00.000Z`).getTime()
  const b = new Date(`${bIso}T00:00:00.000Z`).getTime()
  return Math.round((a - b) / 86400000)
}

function StatusBadge({ result }) {
  if (!result) return null
  if (result.late) {
    const delta = daysBetween(result.finishDay, result.deadlineDisplay)
    const text = result.outOfHorizon
      ? 'не влезает в горизонт'
      : delta > 0
        ? `опоздаем на ${delta} ${delta === 1 ? 'день' : delta < 5 ? 'дня' : 'дней'}`
        : 'просрочен'
    return <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-700">✗ {text}</span>
  }
  if (result.risk) {
    return <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700">⚠ впритык</span>
  }
  if (!result.finishDay) return null
  return <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-700">✓ в срок</span>
}

function formatDeadline(iso) {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

export function OrderList() {
  const orders = usePlanStore((s) => s.getFilteredOrders())
  const selectedOrderId = usePlanStore((s) => s.selectedOrderId)
  const setSelectedOrderId = usePlanStore((s) => s.setSelectedOrderId)
  const result = useScheduleResult()

  if (!orders.length) {
    return (
      <div className="p-4 text-sm text-zinc-500">
        Активных заказов нет — все либо в `done`, либо отменены.
      </div>
    )
  }

  // Сортировка ровно как у schedule(): rush первыми, потом по deadline
  const sorted = [...orders].sort((a, b) => {
    const aRush = (a.priority === 'urgent' || a.is_urgent) ? 0 : 1
    const bRush = (b.priority === 'urgent' || b.is_urgent) ? 0 : 1
    if (aRush !== bRush) return aRush - bRush
    const aD = a.deadline ? new Date(a.deadline).getTime() : Infinity
    const bD = b.deadline ? new Date(b.deadline).getTime() : Infinity
    return aD - bD
  })

  return (
    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {sorted.map((o) => {
        const r = result.byOrder[o.id]
        const palette = getOrderPalette(o.id)
        const isSelected = selectedOrderId === o.id
        const isRush = o.priority === 'urgent' || o.is_urgent
        const stageLabel = ORDER_STATUSES[o.status]?.label || o.status
        const typeLabel = ORDER_TYPES[o.order_type]?.label || o.order_type
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => setSelectedOrderId(isSelected ? null : o.id)}
            className={`w-full text-left p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${isSelected ? 'bg-zinc-50 dark:bg-zinc-900/50' : ''}`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${palette.dot}`} aria-hidden />
              <span className="font-mono text-sm font-bold">#{formatOrderNumber(o)}</span>
              {isRush && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700 tracking-wide">
                  срочно
                </span>
              )}
              <span className="ml-auto"><StatusBadge result={r} /></span>
            </div>
            <div className="text-[12px] text-zinc-600 dark:text-zinc-400 mb-1.5 truncate">
              {typeLabel} · {o.qty} шт · {stageLabel}
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              {o.deadline && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-semibold">
                  🚩 {formatDeadline(r?.deadlineDisplay || o.deadline.slice(0, 10))}
                </span>
              )}
              {r?.finishDay && (
                <span className="text-zinc-500">
                  Готов: {formatDeadline(r.finishDay)}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
