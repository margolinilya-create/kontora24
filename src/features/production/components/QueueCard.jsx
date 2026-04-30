import { Link } from 'react-router-dom'
import { StatusBadge } from '@/features/orders/components/StatusBadge'
import { StatusSwitcher } from '@/features/orders/components/StatusSwitcher'
import { ORDER_TYPES } from '@/shared/constants'
import { formatPrice, formatRelative } from '@/shared/lib/utils'

export function QueueCard({ order, onUpdated }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Link to={`/orders/${order.id}`} className="text-lg font-semibold text-accent hover:underline">
          #{order.number}
        </Link>
        <StatusBadge status={order.status} />
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

      {order.client?.name && (
        <p className="text-sm text-text-muted">Клиент: {order.client.name}</p>
      )}

      {order.notes && (
        <p className="text-sm text-text-muted truncate">📝 {order.notes}</p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-xs text-text-muted">{formatRelative(order.created_at)}</span>
        <StatusSwitcher order={order} onUpdated={onUpdated} />
      </div>
    </div>
  )
}
