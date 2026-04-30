import { ORDER_STATUSES } from '@/shared/constants'
import { formatDateTime } from '@/shared/lib/utils'

const FLOW = ['new', 'design', 'design_done', 'print', 'print_done', 'assembly', 'done']

export function OrderTimeline({ order, history }) {
  if (!order) return null

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
          {/* Progress bar */}
          <div className="absolute top-4 left-4 right-4 h-0.5 bg-border">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${Math.max(0, (currentIdx / (FLOW.length - 1)) * 100)}%` }}
            />
          </div>

          {/* Steps */}
          <div className="relative flex justify-between">
            {FLOW.map((status, i) => {
              const isCompleted = i <= currentIdx
              const isCurrent = i === currentIdx
              const s = ORDER_STATUSES[status]
              const ts = timestamps[status]

              return (
                <div key={status} className="flex flex-col items-center" style={{ width: `${100 / FLOW.length}%` }}>
                  {/* Circle */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold z-10 transition-colors ${
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

                  {/* Label */}
                  <p className={`text-xs mt-2 text-center leading-tight ${isCurrent ? 'font-semibold text-accent' : isCompleted ? 'text-text' : 'text-text-muted'}`}>
                    {s?.label || status}
                  </p>

                  {/* Timestamp */}
                  {ts && (
                    <p className="text-[10px] text-text-muted mt-0.5 text-center">
                      {formatDateTime(ts)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
