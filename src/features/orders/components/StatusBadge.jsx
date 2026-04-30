import { ORDER_STATUSES } from '@/shared/constants'

export function StatusBadge({ status }) {
  const s = ORDER_STATUSES[status]
  if (!s) return <span className="text-xs text-text-muted">{status}</span>

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  )
}
