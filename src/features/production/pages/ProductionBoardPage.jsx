import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useOrders } from '@/features/orders/hooks/useOrders'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { StatusBadge } from '@/features/orders/components/StatusBadge'
import { StatusSwitcher } from '@/features/orders/components/StatusSwitcher'
import { ClaimButton } from '@/features/orders/components/ClaimButton'
import { ORDER_TYPES, ORDER_STATUSES } from '@/shared/constants'
import { formatRelative } from '@/shared/lib/utils'
import { differenceInHours, differenceInMinutes } from 'date-fns'

export default function ProductionBoardPage() {
  const { profile } = useAuth()
  const [showMine, setShowMine] = useState(false)
  const [sortBy, setSortBy] = useState('created') // 'created' | 'deadline'

  const { orders: designOrders, refetch: r1 } = useOrders({ status: 'design' })
  const { orders: printOrders, refetch: r2 } = useOrders({ status: 'print' })
  const { orders: assemblyOrders, refetch: r3 } = useOrders({ status: 'assembly' })
  const refetchAll = () => { r1(); r2(); r3() }

  function filterAndSort(orders) {
    let filtered = showMine && profile ? orders.filter((o) => o.assigned_to === profile.id) : orders
    if (sortBy === 'deadline') {
      filtered = [...filtered].sort((a, b) => {
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return new Date(a.deadline) - new Date(b.deadline)
      })
    }
    return filtered
  }

  const columns = [
    { status: 'design', label: 'Дизайн', orders: filterAndSort(designOrders) },
    { status: 'print', label: 'Печать', orders: filterAndSort(printOrders) },
    { status: 'assembly', label: 'Сборка', orders: filterAndSort(assemblyOrders) },
  ]

  const total = designOrders.length + printOrders.length + assemblyOrders.length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Производство</h1>
          <p className="text-text-muted">{total} заказов в работе</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMine(!showMine)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${showMine ? 'bg-accent text-white' : 'bg-surface border border-border text-text-muted hover:bg-surface-dim'}`}
          >
            {showMine ? 'Мои' : 'Все'}
          </button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="created">По дате</option>
            <option value="deadline">По дедлайну</option>
          </select>
        </div>
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
                  <p className="text-text-muted text-sm">{showMine ? 'Нет моих заказов' : 'Пусто'}</p>
                </div>
              ) : (
                col.orders.map((order) => (
                  <div key={order.id} className="bg-surface rounded-xl border border-border p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <Link to={`/orders/${order.id}`} className="font-semibold text-accent hover:underline">
                        #{order.number}
                      </Link>
                      <div className="flex items-center gap-1.5">
                        <ClaimButton order={order} onClaimed={refetchAll} />
                        <StatusBadge status={order.status} />
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
                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-border">
                      <span className="text-xs text-text-muted" title="Время в статусе">
                        {(() => {
                          const h = differenceInHours(new Date(), new Date(order.updated_at))
                          if (h < 1) return `${differenceInMinutes(new Date(), new Date(order.updated_at))} мин`
                          if (h < 24) return `${h} ч`
                          return `${Math.floor(h / 24)} дн`
                        })()}
                      </span>
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
