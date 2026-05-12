import { memo } from 'react'
import { Link } from 'react-router-dom'
import { StatusSwitcher } from '@/features/orders/components/StatusSwitcher'
import { StageProgressBar } from './logs/StageProgressBar'
import { useProductionLogs } from '../hooks/useProductionLogs'
import { ORDER_TYPES, PRIORITIES } from '@/shared/constants'
import { formatDate, formatOrderNumber } from '@/shared/lib/utils'
import { getDeadlineLevel, getDeadlineClasses, getDeadlineDotClass } from '@/shared/lib/deadline'

const PRIORITY_BORDER = {
  urgent: 'border-l-danger',
  high: 'border-l-dept-pouring',
}

export const QueueCard = memo(function QueueCard({ order, onUpdated }) {
  const { getStageProgress, error: logsError } = useProductionLogs(order.id, order.qty)
  const progress = getStageProgress(order.status)

  const deadlineLevel = getDeadlineLevel(order.deadline)
  const deadlineTextClass = getDeadlineClasses(order.deadline) || 'text-text-muted'
  const deadlineDotClass = getDeadlineDotClass(order.deadline)
  const priorityBorder = PRIORITY_BORDER[order.priority]

  return (
    <Link
      to={`/orders/${order.id}`}
      className={`block bg-surface rounded-2xl border border-border shadow-card p-4 space-y-2 transition-[border-color,box-shadow] hover:border-accent/40 active:bg-surface-2${
        priorityBorder ? ` border-l-[4px] ${priorityBorder}` : ''
      }`}
    >
      {/* Header: #number · client | priority */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base font-semibold text-text shrink-0">#{formatOrderNumber(order)}</span>
          {order.client?.name && (
            <>
              <span className="text-text-muted">·</span>
              <span className="text-sm text-text truncate">{order.client.name}</span>
            </>
          )}
        </div>
        {(order.priority === 'urgent' || order.priority === 'high') && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${PRIORITIES[order.priority]?.color}`}>
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

      {/* Deadline with colored dot */}
      {order.deadline && (
        <p className={`text-sm flex items-center gap-1.5 ${deadlineTextClass} ${deadlineLevel === 'urgent' ? 'font-semibold' : ''}`}>
          {deadlineDotClass && (
            <span className={`w-1.5 h-1.5 rounded-full ${deadlineDotClass}`} aria-hidden="true" />
          )}
          Сдача: {formatDate(order.deadline)}
        </p>
      )}

      {/* Progress */}
      {!logsError && <StageProgressBar progress={progress} compact />}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1" onClick={(e) => e.preventDefault()}>
        <StatusSwitcher order={order} onUpdated={onUpdated} />
      </div>
    </Link>
  )
})
