import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from 'react-router-dom'
import { StatusBadge } from '@/features/orders/components/StatusBadge'
import { ClaimButton } from '@/features/orders/components/ClaimButton'
import { ORDER_TYPES } from '@/shared/constants'
import { differenceInHours, differenceInMinutes } from 'date-fns'

export function DraggableCard({ order, onUpdated }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: order.id,
    data: { status: order.status },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const timeInStatus = (() => {
    const h = differenceInHours(new Date(), new Date(order.updated_at))
    if (h < 1) return `${differenceInMinutes(new Date(), new Date(order.updated_at))} мин`
    if (h < 24) return `${h} ч`
    return `${Math.floor(h / 24)} дн`
  })()

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-surface rounded-xl border border-border p-4 hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing touch-none"
    >
      <div className="flex items-center justify-between mb-2">
        <Link
          to={`/orders/${order.id}`}
          className="font-semibold text-accent hover:underline"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          #{order.number}
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-muted">{timeInStatus}</span>
          <ClaimButton order={order} onClaimed={onUpdated} />
        </div>
      </div>
      <p className="text-sm text-text-muted mb-1">
        {ORDER_TYPES[order.order_type]?.label} · {order.width_mm}×{order.height_mm} · {order.qty} шт
      </p>
      {order.deadline && (
        <p className={`text-xs mb-1 ${new Date(order.deadline) < new Date() ? 'text-danger font-medium' : 'text-text-muted'}`}>
          Дедлайн: {new Date(order.deadline).toLocaleDateString('ru-RU')}
        </p>
      )}
      {order.assignee?.display_name && (
        <p className="text-xs text-text-muted">→ {order.assignee.display_name}</p>
      )}
    </div>
  )
}
