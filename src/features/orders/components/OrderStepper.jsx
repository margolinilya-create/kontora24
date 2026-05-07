import { ORDER_STATUSES, getOrderRoute } from '@/shared/constants'
import { formatDateTime } from '@/shared/lib/utils'

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
 */
export function OrderStepper({ order, history }) {
  if (!order) return null
  const route = getOrderRoute(order)
  const currentIdx = route.indexOf(order.status)
  const isCancelled = order.status === 'cancelled'

  // map: status → first transition into it
  const tsByStatus = {}
  history?.forEach((h) => {
    if (!tsByStatus[h.to_status]) tsByStatus[h.to_status] = h
  })

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

          return (
            <li key={status} className="flex items-center gap-1.5">
              <div className="flex flex-col items-center gap-1" title={tooltip}>
                <span
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    isCurrent
                      ? `${dotCls} ring-4 ring-accent/25`
                      : isCompleted
                        ? dotCls
                        : 'bg-surface-2 ring-1 ring-border'
                  }`}
                  aria-hidden="true"
                />
                <span className={`text-[10px] leading-tight whitespace-nowrap ${
                  isCurrent ? 'font-semibold text-text' : isCompleted ? 'text-text-muted' : 'text-text-muted/60'
                }`}>
                  {s?.label || status}
                </span>
              </div>
              {i < route.length - 1 && (
                <span className={`h-px w-4 sm:w-6 ${i < currentIdx ? 'bg-text-muted/40' : 'bg-border'}`} aria-hidden="true" />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
