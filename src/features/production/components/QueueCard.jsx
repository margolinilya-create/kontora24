import { useState, memo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { StatusSwitcher } from '@/features/orders/components/StatusSwitcher'
import { ClaimButton } from '@/features/orders/components/ClaimButton'
import { TechCardPreview } from './TechCardPreview'
import { TaskTimer } from './TaskTimer'
import { OperationChecklist } from './OperationChecklist'
import { ProductionLogForm } from './logs/ProductionLogForm'
import { StageProgressBar } from './logs/StageProgressBar'
import { useProductionLogs } from '../hooks/useProductionLogs'
import { addProductionLogAndCheckAdvance } from '@/features/orders/hooks/useOrders'
import Button from '@/shared/components/Button'
import Modal from '@/shared/components/Modal'
import { ORDER_TYPES, PRIORITIES } from '@/shared/constants'
import { formatRelative, formatDate } from '@/shared/lib/utils'

export const QueueCard = memo(function QueueCard({ order, onUpdated }) {
  const { profile } = useAuth()
  const [showLogForm, setShowLogForm] = useState(false)
  const [showTechCard, setShowTechCard] = useState(false)
  const { getStageProgress } = useProductionLogs(order.id, order.qty)
  const isMine = profile && order.assigned_to === profile.id

  const progress = getStageProgress(order.status)

  const deadlineDate = order.deadline ? new Date(order.deadline) : null
  const now = new Date()
  const isOverdue = deadlineDate && deadlineDate < now
  const isUrgentDeadline = deadlineDate && !isOverdue && deadlineDate < new Date(now.getTime() + 86400000 * 2)

  const handleLogSubmit = useCallback(async (stage, logData) => {
    await addProductionLogAndCheckAdvance(order.id, stage, logData, order)
    setShowLogForm(false)
    onUpdated?.()
  }, [order, onUpdated])

  return (
    <div className={`bg-surface rounded-xl border border-border p-4 sm:p-5 space-y-3${
      isMine ? ' ring-2 ring-accent/20' : ''
    }${order.priority === 'urgent' ? ' border-l-4 border-l-danger' : order.priority === 'high' ? ' border-l-4 border-l-warning' : ''}`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link to={`/orders/${order.id}`} className="text-lg font-semibold text-accent hover:underline shrink-0" aria-label={`Открыть заказ #${order.number}`}>
            #{order.number}
          </Link>
          {order.client?.name && (
            <span className="text-sm text-text-muted truncate">{order.client.name}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(order.priority === 'urgent' || order.priority === 'high') && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PRIORITIES[order.priority]?.color}`}>
              {PRIORITIES[order.priority]?.label}
            </span>
          )}
          <ClaimButton order={order} onClaimed={onUpdated} />
        </div>
      </div>

      {/* Key info — compact 2-column grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div>
          <span className="text-text-muted">Тип: </span>
          <span className="font-medium">{ORDER_TYPES[order.order_type]?.label || order.order_type}</span>
        </div>
        <div>
          <span className="text-text-muted">Тираж: </span>
          <span className="font-medium">{order.qty} шт</span>
        </div>
        <div>
          <span className="text-text-muted">Размер: </span>
          {order.width_mm}x{order.height_mm}
        </div>
        {deadlineDate && (
          <div>
            <span className="text-text-muted">Сдача: </span>
            <span className={isOverdue ? 'text-danger font-semibold' : isUrgentDeadline ? 'text-warning font-semibold' : ''}>
              {formatDate(order.deadline)}
            </span>
          </div>
        )}
      </div>

      {order.assignee?.display_name && (
        <p className="text-xs text-text-muted">Исполнитель: {order.assignee.display_name}</p>
      )}

      {/* Progress bar */}
      <StageProgressBar progress={progress} />

      <TaskTimer orderId={order.id} orderStatus={order.status} compact />

      {/* Actions — full-width on mobile for easy tapping */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTechCard(true)} className="text-xs text-text-muted hover:text-accent transition-colors min-h-[44px] px-2">
            Тех карта
          </button>
          <OperationChecklist order={order} compact />
          <span className="text-xs text-text-muted">{formatRelative(order.created_at)}</span>
        </div>
        <div className="flex items-center gap-2">
          {isMine && (
            <Button size="sm" onClick={() => setShowLogForm(true)} className="flex-1 sm:flex-none">
              Записать
            </Button>
          )}
          <StatusSwitcher order={order} onUpdated={onUpdated} />
        </div>
      </div>

      {/* Production log form modal */}
      {showLogForm && (
        <Modal isOpen onClose={() => setShowLogForm(false)} title="Записать результат" maxWidth="max-w-md">
          <ProductionLogForm
            stage={order.status}
            progress={progress}
            onSubmit={handleLogSubmit}
          />
        </Modal>
      )}

      <TechCardPreview orderId={order.id} isOpen={showTechCard} onClose={() => setShowTechCard(false)} />
    </div>
  )
})
