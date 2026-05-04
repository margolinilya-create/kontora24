import { useState, memo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { StatusBadge } from '@/features/orders/components/StatusBadge'
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
    <div className={`bg-surface rounded-xl border border-border p-5 space-y-3${order.priority === 'urgent' ? ' border-l-4 border-l-danger' : order.priority === 'high' ? ' border-l-4 border-l-warning' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to={`/orders/${order.id}`} className="text-lg font-semibold text-accent hover:underline" aria-label={`Открыть заказ #${order.number}`}>
            #{order.number}
          </Link>
          <button onClick={() => setShowTechCard(true)} className="text-xs text-text-muted hover:text-accent transition-colors min-h-[44px]">Тех карта</button>
        </div>
        <div className="flex items-center gap-2">
          {(order.priority === 'urgent' || order.priority === 'high') && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PRIORITIES[order.priority]?.color}`}>
              {PRIORITIES[order.priority]?.label}
            </span>
          )}
          <ClaimButton order={order} onClaimed={onUpdated} />
          <StatusBadge status={order.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-text-muted">Тип: </span>
          {ORDER_TYPES[order.order_type]?.label || order.order_type}
        </div>
        <div>
          <span className="text-text-muted">Размер: </span>
          {order.width_mm}x{order.height_mm} мм
        </div>
        <div>
          <span className="text-text-muted">Тираж: </span>
          {order.qty} шт
        </div>
        {deadlineDate && (
          <div>
            <span className="text-text-muted">Сдача: </span>
            <span className={isOverdue ? 'text-danger font-medium' : isUrgentDeadline ? 'text-warning font-medium' : ''}>
              {formatDate(order.deadline)}
            </span>
          </div>
        )}
      </div>

      {order.assignee?.display_name && (
        <p className="text-xs text-text-muted">Исполнитель: {order.assignee.display_name}</p>
      )}

      {order.client?.name && (
        <p className="text-sm text-text-muted">Клиент: {order.client.name}</p>
      )}

      {/* Progress bar */}
      <StageProgressBar progress={progress} />

      <TaskTimer orderId={order.id} orderStatus={order.status} compact />

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{formatRelative(order.created_at)}</span>
          <OperationChecklist order={order} compact />
        </div>
        <div className="flex items-center gap-2">
          {isMine && (
            <Button size="sm" onClick={() => setShowLogForm(true)}>Записать</Button>
          )}
          <StatusSwitcher order={order} onUpdated={onUpdated} aria-label={`Сменить статус заказа #${order.number}`} />
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
