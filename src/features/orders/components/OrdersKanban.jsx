import { Link } from 'react-router-dom'
import { StatusSwitcher } from './StatusSwitcher'
import { ORDER_STATUSES, ORDER_TYPES } from '@/shared/constants'
import { formatPrice, formatRelative } from '@/shared/lib/utils'

const KANBAN_COLS = ['new', 'design', 'prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'pouring', 'assembly_3d', 'packaging', 'otk', 'done', 'cancelled']

export function OrdersKanban({ orders, onUpdated }) {
  const columns = KANBAN_COLS.map((status) => ({
    status,
    label: ORDER_STATUSES[status]?.label || status,
    color: ORDER_STATUSES[status]?.color || '',
    orders: orders.filter((o) => o.status === status),
  }))

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div key={col.status} className="flex-shrink-0 w-72">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${col.color.split(' ')[0]}`} />
              {col.label}
            </h3>
            <span className="text-xs text-text-muted bg-surface-dim px-2 py-0.5 rounded-full">
              {col.orders.length}
            </span>
          </div>

          <div className="space-y-2 min-h-[200px]">
            {col.orders.length === 0 ? (
              <div className="border border-dashed border-border rounded-lg p-6 text-center">
                <p className="text-xs text-text-muted">Пусто</p>
              </div>
            ) : (
              col.orders.map((order) => (
                <div key={order.id} className="bg-surface rounded-lg border border-border p-3 shadow-sm hover:shadow transition-shadow">
                  <div className="flex items-center justify-between mb-1.5">
                    <Link to={`/orders/${order.id}`} className="font-semibold text-sm text-accent hover:underline">
                      #{order.number}
                    </Link>
                    <span className="text-xs font-medium">{formatPrice(order.price_final)}</span>
                  </div>
                  <p className="text-xs text-text-muted mb-1">
                    {ORDER_TYPES[order.order_type]?.label} · {order.qty} шт
                  </p>
                  {order.client?.name && (
                    <p className="text-xs text-text-muted mb-1">{order.client.name}</p>
                  )}
                  {order.deadline && (
                    <p className={`text-xs mb-1 ${new Date(order.deadline) < new Date() ? 'text-danger font-medium' : 'text-text-muted'}`}>
                      Дедлайн: {new Date(order.deadline).toLocaleDateString('ru-RU')}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                    <span className="text-[10px] text-text-muted">{formatRelative(order.created_at)}</span>
                    <StatusSwitcher order={order} onUpdated={onUpdated} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
