import { ORDER_TYPES } from '@/shared/constants'
import { Link } from 'react-router-dom'

export function BatchView({ orders }) {
  // Group by order_type + dimensions (rounded to nearest 10mm for grouping)
  const groups = {}
  orders.forEach((order) => {
    const key = `${order.order_type}_${order.width_mm}x${order.height_mm}`
    if (!groups[key]) {
      groups[key] = {
        type: order.order_type,
        width: order.width_mm,
        height: order.height_mm,
        orders: [],
        totalQty: 0,
        totalArea: 0,
      }
    }
    groups[key].orders.push(order)
    groups[key].totalQty += order.qty
    groups[key].totalArea += (order.width_mm * order.height_mm * order.qty) / 1000000 // m2
  })

  const sorted = Object.values(groups).sort((a, b) => b.totalArea - a.totalArea)

  if (sorted.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border p-12 text-center">
        <p className="text-text-muted">Нет заказов в печати</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sorted.map((group) => (
        <div key={`${group.type}_${group.width}x${group.height}`} className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold">
                {ORDER_TYPES[group.type]?.label} — {group.width}x{group.height} мм
              </h3>
              <p className="text-sm text-text-muted">
                {group.orders.length} заказов · {group.totalQty} шт · {group.totalArea.toFixed(2)} м2
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {group.orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between py-2 px-3 bg-surface-dim rounded-lg text-sm">
                <div className="flex items-center gap-3">
                  <Link to={`/orders/${order.id}`} className="font-semibold text-accent hover:underline">
                    #{order.number}
                  </Link>
                  <span className="text-text-muted">{order.qty} шт</span>
                  {order.client?.name && <span className="text-text-muted">· {order.client.name}</span>}
                  {order.deadline && (
                    <span className={`text-xs ${new Date(order.deadline) < new Date() ? 'text-danger font-medium' : 'text-text-muted'}`}>
                      {new Date(order.deadline).toLocaleDateString('ru-RU')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {order.assignee?.display_name && <span className="text-xs text-text-muted">{order.assignee.display_name}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
