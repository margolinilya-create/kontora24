import { memo } from 'react'
import { Link } from 'react-router-dom'
import { ClaimButton } from '@/features/orders/components/ClaimButton'
import { StatusSwitcher } from '@/features/orders/components/StatusSwitcher'
import { StageProgressBar } from './logs/StageProgressBar'
import { useProductionLogs } from '../hooks/useProductionLogs'
import { ORDER_TYPES, PRIORITIES } from '@/shared/constants'
import { formatDate } from '@/shared/lib/utils'

export const QueueCard = memo(function QueueCard({ order, onUpdated }) {
  const { getStageProgress } = useProductionLogs(order.id, order.qty)
  const progress = getStageProgress(order.status)

  const deadlineDate = order.deadline ? new Date(order.deadline) : null
  const now = new Date()
  const isOverdue = deadlineDate && deadlineDate < now
  const isUrgentDeadline = deadlineDate && !isOverdue && deadlineDate < new Date(now.getTime() + 86400000 * 2)

  return (
    <Link
      to={`/orders/${order.id}`}
      className={`block bg-surface rounded-xl border border-border p-4 space-y-2 transition-colors hover:border-accent/30 active:bg-surface-dim${
        order.assigned_to ? ' ring-2 ring-accent/20' : ''
      }${order.priority === 'urgent' ? ' border-l-4 border-l-danger' : order.priority === 'high' ? ' border-l-4 border-l-warning' : ''}`}
    >
      {/* Header: #number · client | priority */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base font-semibold text-accent shrink-0">#{order.number}</span>
          {order.client?.name && (
            <>
              <span className="text-text-muted">·</span>
              <span className="text-sm text-text truncate">{order.client.name}</span>
            </>
          )}
        </div>
        {(order.priority === 'urgent' || order.priority === 'high') && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${PRIORITIES[order.priority]?.color}`}>
            {PRIORITIES[order.priority]?.label}
          </span>
        )}
      </div>

      {/* Specs */}
      <p className="text-sm text-text-muted">
        {ORDER_TYPES[order.order_type]?.label || order.order_type}
        {' · '}{order.width_mm}x{order.height_mm}
        {' · '}{order.qty} шт
      </p>

      {/* Deadline */}
      {deadlineDate && (
        <p className={`text-sm ${isOverdue ? 'text-danger font-semibold' : isUrgentDeadline ? 'text-warning font-semibold' : 'text-text-muted'}`}>
          Сдача: {formatDate(order.deadline)}
        </p>
      )}

      {/* Progress */}
      <StageProgressBar progress={progress} compact />

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1" onClick={(e) => e.preventDefault()}>
        <ClaimButton order={order} onClaimed={onUpdated} />
        <StatusSwitcher order={order} onUpdated={onUpdated} />
      </div>
    </Link>
  )
})
