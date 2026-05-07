import { ORDER_STATUSES } from '@/shared/constants'
import { formatDateTime } from '@/shared/lib/utils'

/**
 * Полная история смен статуса заказа.
 */
export function OrderHistoryTab({ history }) {
  if (!history || history.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-5 text-text-muted text-sm">
        Нет записей
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-card p-5">
      <h2 className="font-semibold text-lg mb-4">История изменений</h2>
      <ol className="space-y-3">
        {history.map((h) => (
          <li key={h.id} className="flex items-start gap-3 text-sm">
            <span className="w-2 h-2 rounded-full bg-accent mt-2 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p>
                {h.from_status && (
                  <><span className="text-text-muted">{ORDER_STATUSES[h.from_status]?.label || h.from_status}</span>{' → '}</>
                )}
                <span className="font-medium">{ORDER_STATUSES[h.to_status]?.label || h.to_status}</span>
              </p>
              <p className="text-xs text-text-muted">
                {h.changed_by_profile?.display_name || 'Система'} · {formatDateTime(h.created_at)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
