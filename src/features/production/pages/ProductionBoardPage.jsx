import { Link } from 'react-router-dom'
import { useOrders } from '@/features/orders/hooks/useOrders'
import { StatusBadge } from '@/features/orders/components/StatusBadge'
import { StatusSwitcher } from '@/features/orders/components/StatusSwitcher'
import { ORDER_TYPES, ORDER_STATUSES } from '@/shared/constants'
import { formatRelative } from '@/shared/lib/utils'

const COLUMNS = [
  { status: 'design', label: 'Дизайн' },
  { status: 'print', label: 'Печать' },
  { status: 'assembly', label: 'Сборка' },
]

export default function ProductionBoardPage() {
  const { orders: designOrders, refetch: r1 } = useOrders({ status: 'design' })
  const { orders: printOrders, refetch: r2 } = useOrders({ status: 'print' })
  const { orders: assemblyOrders, refetch: r3 } = useOrders({ status: 'assembly' })

  const refetchAll = () => { r1(); r2(); r3() }

  const columns = [
    { ...COLUMNS[0], orders: designOrders },
    { ...COLUMNS[1], orders: printOrders },
    { ...COLUMNS[2], orders: assemblyOrders },
  ]

  const total = designOrders.length + printOrders.length + assemblyOrders.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Производство</h1>
        <p className="text-text-muted">{total} заказов в работе</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {columns.map((col) => (
          <div key={col.status}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${ORDER_STATUSES[col.status]?.color?.split(' ')[0] || 'bg-gray-300'}`} />
                {col.label}
              </h2>
              <span className="text-sm text-text-muted bg-surface-dim px-2 py-0.5 rounded-full">{col.orders.length}</span>
            </div>

            <div className="space-y-3">
              {col.orders.length === 0 ? (
                <div className="bg-surface rounded-xl border border-border border-dashed p-8 text-center">
                  <p className="text-text-muted text-sm">Пусто</p>
                </div>
              ) : (
                col.orders.map((order) => (
                  <div key={order.id} className="bg-surface rounded-xl border border-border p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <Link to={`/orders/${order.id}`} className="font-semibold text-accent hover:underline">
                        #{order.number}
                      </Link>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm text-text-muted mb-2">
                      {ORDER_TYPES[order.order_type]?.label} · {order.width_mm}×{order.height_mm} · {order.qty} шт
                    </p>
                    {order.client?.name && <p className="text-xs text-text-muted mb-2">{order.client.name}</p>}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-xs text-text-muted">{formatRelative(order.created_at)}</span>
                      <StatusSwitcher order={order} onUpdated={refetchAll} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
