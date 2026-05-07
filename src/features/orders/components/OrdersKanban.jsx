import { Link } from 'react-router-dom'
import { StatusSwitcher } from './StatusSwitcher'
import { ORDER_STATUSES, ORDER_TYPES } from '@/shared/constants'
import { stageDotClass } from '@/shared/lib/department-mapping'
import { getDeadlineLevel, getDeadlineClasses, getDeadlineDotClass } from '@/shared/lib/deadline'
import { formatPrice, formatRelative } from '@/shared/lib/utils'

const KANBAN_COLS = ['new', 'design', 'prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'pouring', 'assembly_3d', 'packaging', 'otk', 'done', 'cancelled']

export function OrdersKanban({ orders, onUpdated }) {
  const columns = KANBAN_COLS.map((status) => ({
    status,
    label: ORDER_STATUSES[status]?.label || status,
    orders: orders.filter((o) => o.status === status),
  }))

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 kanban-scroll">
      {columns.map((col) => (
        <div key={col.status} className="flex-shrink-0 w-72">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-semibold text-sm flex items-center gap-2 text-text">
              <span className={`w-2.5 h-2.5 rounded-full ${stageDotClass(col.status)}`} aria-hidden="true" />
              {col.label}
            </h3>
            <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">
              {col.orders.length}
            </span>
          </div>

          <div className="space-y-2 min-h-[200px]">
            {col.orders.length === 0 ? (
              <div className="border border-dashed border-border rounded-2xl p-6 text-center">
                <p className="text-xs text-text-muted">Пусто</p>
              </div>
            ) : (
              col.orders.map((order) => {
                const deadlineLevel = getDeadlineLevel(order.deadline)
                const deadlineDotClass = getDeadlineDotClass(order.deadline)
                const deadlineTextClass = getDeadlineClasses(order.deadline) || 'text-text-muted'
                return (
                  <div key={order.id} className="bg-surface rounded-2xl border border-border shadow-card p-3 hover:border-accent/40 transition-[border-color] duration-200">
                    <div className="flex items-center justify-between mb-1.5">
                      <Link to={`/orders/${order.id}`} className="font-semibold text-sm text-text hover:text-accent transition-colors">
                        #{order.number}
                      </Link>
                      <span className="text-xs font-medium text-text">{formatPrice(order.price_final)}</span>
                    </div>
                    <p className="text-xs text-text-muted mb-1">
                      {ORDER_TYPES[order.order_type]?.label} · {order.qty} шт
                    </p>
                    {order.client?.name && (
                      <p className="text-xs text-text-muted mb-1">{order.client.name}</p>
                    )}
                    {order.deadline && (
                      <p className={`text-xs mb-1 flex items-center gap-1.5 ${deadlineTextClass} ${deadlineLevel === 'urgent' ? 'font-medium' : ''}`}>
                        {deadlineDotClass && (
                          <span className={`w-1.5 h-1.5 rounded-full ${deadlineDotClass}`} aria-hidden="true" />
                        )}
                        Дедлайн: {new Date(order.deadline).toLocaleDateString('ru-RU')}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                      <span className="text-[10px] text-text-muted">{formatRelative(order.created_at)}</span>
                      <StatusSwitcher order={order} onUpdated={onUpdated} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
