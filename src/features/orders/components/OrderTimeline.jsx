import { ORDER_STATUSES, getOrderRoute } from '@/shared/constants'
import { formatDateTime } from '@/shared/lib/utils'

export function OrderTimeline({ order, history }) {
  if (!order) return null
  const FLOW = getOrderRoute(order)

  const currentIdx = FLOW.indexOf(order.status)
  const isCancelled = order.status === 'cancelled'

  // Build timestamp map from history
  const timestamps = {}
  history?.forEach((h) => {
    if (!timestamps[h.to_status]) timestamps[h.to_status] = h.created_at
  })

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Прогресс</h2>

      {isCancelled ? (
        <div className="flex items-center gap-3 p-3 bg-danger/10 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-danger flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-danger">Отменён</p>
            {timestamps.cancelled && (
              <p className="text-xs text-text-muted">{formatDateTime(timestamps.cancelled)}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* Desktop progress bar (horizontal) */}
          <div className="hidden sm:block absolute top-4 left-4 right-4 h-0.5 bg-border">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${Math.max(0, (currentIdx / (FLOW.length - 1)) * 100)}%` }}
            />
          </div>

          {/* Mobile progress bar (vertical) */}
          <div className="sm:hidden absolute left-3.5 top-0 bottom-0 w-0.5 bg-border">
            <div
              className="w-full bg-accent transition-all duration-500"
              style={{ height: `${Math.max(0, (currentIdx / (FLOW.length - 1)) * 100)}%` }}
            />
          </div>

          {/* Steps */}
          <div className="relative flex flex-col sm:flex-row sm:justify-between gap-4 sm:gap-0">
            {FLOW.map((status, i) => {
              const isCompleted = i <= currentIdx
              const isCurrent = i === currentIdx
              const s = ORDER_STATUSES[status]
              const ts = timestamps[status]

              return (
                <div
                  key={status}
                  className="flex flex-row sm:flex-col items-center sm:items-center gap-3 sm:gap-0"
                  style={{ width: undefined }}
                >
                  {/* Circle */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold z-10 flex-shrink-0 transition-colors ${
                    isCurrent ? 'bg-accent text-white ring-4 ring-accent/20' :
                    isCompleted ? 'bg-accent text-white' :
                    'bg-surface border-2 border-border text-text-muted'
                  }`}>
                    {isCompleted && !isCurrent ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>

                  {/* Label + timestamp */}
                  <div className="sm:text-center">
                    <p className={`text-xs sm:mt-2 leading-tight ${isCurrent ? 'font-semibold text-accent' : isCompleted ? 'text-text' : 'text-text-muted'}`}>
                      {s?.label || status}
                    </p>
                    {ts && (
                      <p className="text-[10px] text-text-muted sm:mt-0.5">
                        {formatDateTime(ts)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
