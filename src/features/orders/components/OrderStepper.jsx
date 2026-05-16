import { useState, useRef, useEffect } from 'react'
import { ORDER_STATUSES, ORDER_TYPES, getOrderRoute } from '@/shared/constants'
import { formatDateTime } from '@/shared/lib/utils'
import { updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

const DEPT_DOT = {
  design:  'bg-dept-design',
  print:   'bg-dept-print',
  pouring: 'bg-dept-pouring',
  finish:  'bg-dept-finish',
  info:    'bg-info',
  danger:  'bg-danger',
}

function dotColor(status) {
  switch (status) {
    case 'new': return DEPT_DOT.info
    case 'design':
    case 'prepress': return DEPT_DOT.design
    case 'print':
    case 'lamination':
    case 'cutting': return DEPT_DOT.print
    case 'selection_pouring':
    case 'pouring': return DEPT_DOT.pouring
    case 'assembly_3d':
    case 'packaging':
    case 'otk':
    case 'done': return DEPT_DOT.finish
    case 'cancelled': return DEPT_DOT.danger
    default: return DEPT_DOT.info
  }
}

/**
 * Тонкая «закладочная» лента прогресса по этапам.
 * Каждый этап — точка в цвете отдела, текущий подсвечен ободком,
 * пройденные залиты, будущие — пустые. Tooltip с датой/исполнителем.
 *
 * Если статус заказа выпал из маршрута (напр. сменили design_status='provided'
 * или перетащили в неверную колонку до фикса DnD-валидации) — показываем
 * предупреждение с кнопкой возврата на ближайший валидный этап.
 */
export function OrderStepper({ order, history, onUpdated }) {
  const [returning, setReturning] = useState(false)
  const isMountedRef = useRef(true)
  useEffect(() => () => { isMountedRef.current = false }, [])

  if (!order) return null
  const route = getOrderRoute(order)
  const currentIdx = route.indexOf(order.status)
  const isCancelled = order.status === 'cancelled'
  const isOffRoute = !isCancelled && currentIdx === -1

  // map: status → first transition into it
  const tsByStatus = {}
  history?.forEach((h) => {
    if (!tsByStatus[h.to_status]) tsByStatus[h.to_status] = h
  })

  // Ближайший валидный статус для возврата (первый после 'new'). Если route пустой —
  // оставляем null и не показываем кнопку.
  const recoveryTarget = route.find((s) => s !== 'new') ?? route[0] ?? null

  async function handleReturn() {
    if (!recoveryTarget || returning) return
    setReturning(true)
    try {
      await updateOrderStatus(order.id, order.status, recoveryTarget, { isRollback: true })
      if (!isMountedRef.current) return
      toast.success(`Заказ возвращён на «${ORDER_STATUSES[recoveryTarget]?.label || recoveryTarget}»`)
      onUpdated?.()
    } catch (err) {
      if (isMountedRef.current) toast.error(translateError(err).message)
    } finally {
      if (isMountedRef.current) setReturning(false)
    }
  }

  if (isOffRoute) {
    const currentLabel = ORDER_STATUSES[order.status]?.label || order.status
    const orderTypeLabel = ORDER_TYPES[order.order_type]?.label || order.order_type
    const recoveryLabel = recoveryTarget ? (ORDER_STATUSES[recoveryTarget]?.label || recoveryTarget) : null
    return (
      <div className="bg-warning/10 border border-warning/40 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 text-sm">
          <p className="font-medium text-warning">Заказ вне маршрута</p>
          <p className="text-text-muted text-xs mt-0.5">
            Статус «{currentLabel}» не входит в маршрут типа «{orderTypeLabel}».
            {recoveryTarget ? ' Верните заказ на корректный этап.' : ' Маршрут заказа пуст — обратитесь к администратору.'}
          </p>
        </div>
        {recoveryTarget && (
          <button
            onClick={handleReturn}
            disabled={returning}
            className="text-sm px-3 py-1.5 rounded-lg bg-warning text-on-accent font-medium hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
          >
            {returning ? 'Возвращаем…' : `Вернуть на «${recoveryLabel}»`}
          </button>
        )}
      </div>
    )
  }

  if (isCancelled) {
    return (
      <div className="bg-surface rounded-xl border border-border px-4 py-3 flex items-center gap-2 text-sm">
        <span className={`w-2 h-2 rounded-full ${DEPT_DOT.danger}`} aria-hidden="true" />
        <span className="font-medium text-danger">Отменён</span>
        {tsByStatus.cancelled && (
          <span className="text-text-muted text-xs ml-2">{formatDateTime(tsByStatus.cancelled.created_at)}</span>
        )}
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border px-3 py-2.5 overflow-x-auto">
      <ol className="flex items-center gap-1.5 min-w-max">
        {route.map((status, i) => {
          const isCompleted = i < currentIdx
          const isCurrent = i === currentIdx
          const s = ORDER_STATUSES[status]
          const ts = tsByStatus[status]
          const dotCls = dotColor(status)

          const tooltip = ts
            ? `${formatDateTime(ts.created_at)}${ts.changed_by_profile?.display_name ? ` · ${ts.changed_by_profile.display_name}` : ''}`
            : isCurrent ? 'Текущий этап' : 'Не пройден'

          // Mobile «Dock»: текущий этап крупнее, остальные мелкие без подписи.
          // На md+ — обычный вид (точки одинаковые, подпись под каждой) — фидбэк 17.05.
          const dotSizeCls = isCurrent
            ? 'w-3.5 h-3.5 md:w-2.5 md:h-2.5'
            : 'w-2 h-2 md:w-2.5 md:h-2.5'
          const labelVisibilityCls = isCurrent ? '' : 'hidden md:inline'

          return (
            <li key={status} className="flex items-center gap-1.5">
              <div className="flex flex-col items-center gap-1" title={tooltip}>
                <span
                  className={`${dotSizeCls} rounded-full transition-all ${
                    isCurrent
                      ? `${dotCls} ring-4 ring-accent/25`
                      : isCompleted
                        ? dotCls
                        : 'bg-surface-2 ring-1 ring-border'
                  }`}
                  aria-hidden="true"
                />
                <span className={`text-[10px] leading-tight whitespace-nowrap ${labelVisibilityCls} ${
                  isCurrent ? 'font-semibold text-text text-[11px] md:text-[10px]' : isCompleted ? 'text-text-muted' : 'text-text-muted/60'
                }`}>
                  {s?.label || status}
                </span>
              </div>
              {i < route.length - 1 && (
                <span className={`h-px w-3 sm:w-6 ${i < currentIdx ? 'bg-text-muted/40' : 'bg-border'}`} aria-hidden="true" />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
