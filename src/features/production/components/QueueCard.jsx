import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { StatusBadge } from '@/features/orders/components/StatusBadge'
import { StatusSwitcher } from '@/features/orders/components/StatusSwitcher'
import { ClaimButton } from '@/features/orders/components/ClaimButton'
import { CompleteTaskModal } from './CompleteTaskModal'
import { TechCardPreview } from './TechCardPreview'
import { TaskTimer } from './TaskTimer'
import { DryingTimer } from './DryingTimer'
import { OperationChecklist } from './OperationChecklist'
import Button from '@/shared/components/Button'
import { ORDER_TYPES, PRIORITIES } from '@/shared/constants'
import { formatPrice, formatRelative } from '@/shared/lib/utils'

export function QueueCard({ order, onUpdated }) {
  const { profile } = useAuth()
  const [showComplete, setShowComplete] = useState(false)
  const [showTechCard, setShowTechCard] = useState(false)
  const isMine = profile && order.assigned_to === profile.id

  return (
    <div className={`bg-surface rounded-xl border border-border p-5 space-y-3${order.priority === 'urgent' ? ' border-l-4 border-l-danger' : order.priority === 'high' ? ' border-l-4 border-l-warning' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to={`/orders/${order.id}`} className="text-lg font-semibold text-accent hover:underline" aria-label={`Открыть заказ #${order.number}`}>
            #{order.number}
          </Link>
          <button onClick={() => setShowTechCard(true)} className="text-[11px] text-text-muted hover:text-accent transition-colors">Тех карта</button>
        </div>
        <div className="flex items-center gap-2">
          {(order.priority === 'urgent' || order.priority === 'high') && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIORITIES[order.priority]?.color}`}>
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
          {order.width_mm}×{order.height_mm} мм
        </div>
        <div>
          <span className="text-text-muted">Тираж: </span>
          {order.qty} шт
        </div>
        <div>
          <span className="text-text-muted">Цена: </span>
          {formatPrice(order.price_final)}
        </div>
      </div>

      {order.assignee?.display_name && (
        <p className="text-xs text-text-muted">Исполнитель: {order.assignee.display_name}</p>
      )}

      {order.client?.name && (
        <p className="text-sm text-text-muted">Клиент: {order.client.name}</p>
      )}

      {order.status === 'resin_pouring' && order.dry_until && (
        <DryingTimer dryUntil={order.dry_until} />
      )}

      <TaskTimer orderId={order.id} orderStatus={order.status} compact />

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{formatRelative(order.created_at)}</span>
          <OperationChecklist order={order} compact />
        </div>
        {isMine ? (
          <>
            <Button size="sm" onClick={() => setShowComplete(true)}>Готово</Button>
            <CompleteTaskModal order={order} isOpen={showComplete} onClose={() => setShowComplete(false)} onCompleted={onUpdated} />
          </>
        ) : (
          <StatusSwitcher order={order} onUpdated={onUpdated} aria-label={`Сменить статус заказа #${order.number}`} />
        )}
      </div>
      <TechCardPreview orderId={order.id} isOpen={showTechCard} onClose={() => setShowTechCard(false)} />
    </div>
  )
}
