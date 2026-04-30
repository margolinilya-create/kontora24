import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { ORDER_STATUSES, ORDER_TYPES } from '@/shared/constants'
import { formatPrice, formatRelative } from '@/shared/lib/utils'
import { StatusBadge } from '@/features/orders/components/StatusBadge'

export default function DashboardPage() {
  const { profile, hasRole } = useAuth()
  const isManager = hasRole(['admin', 'manager'])
  const role = profile?.role

  const [data, setData] = useState({ orders: [], statusCounts: {}, lowStock: [], myOrders: [] })
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [ordersRes, materialsRes] = await Promise.all([
      supabase.from('orders').select('*, client:clients(name)').order('created_at', { ascending: false }).limit(50),
      supabase.from('materials').select('*'),
    ])

    const orders = ordersRes.data || []
    const materials = materialsRes.data || []

    const statusCounts = {}
    orders.forEach((o) => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1 })

    const lowStock = materials.filter((m) => m.min_qty > 0 && Number(m.stock_qty) <= Number(m.min_qty))

    // My orders — assigned to current user
    const myOrders = profile ? orders.filter((o) => o.assigned_to === profile.id && o.status !== 'done' && o.status !== 'cancelled') : []

    setData({ orders, statusCounts, lowStock, myOrders })
    setLoading(false)
  }, [profile])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  // Role-specific queue status
  const queueStatus = {
    designer: 'design',
    printer: 'print',
    assembler: 'assembly',
  }
  const myQueueStatus = queueStatus[role]
  const myQueueOrders = myQueueStatus ? data.orders.filter((o) => o.status === myQueueStatus) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-text-muted">
          {profile ? `${profile.display_name}` : ''}
          {role && !isManager ? ` · ${ORDER_STATUSES[myQueueStatus]?.label || role}` : ''}
        </p>
      </div>

      {/* Worker dashboard — show their queue */}
      {!isManager && myQueueStatus && (
        <>
          <div className="bg-accent/10 border border-accent/20 rounded-xl p-5">
            <h2 className="font-semibold text-lg mb-1">Моя очередь: {ORDER_STATUSES[myQueueStatus]?.label}</h2>
            <p className="text-3xl font-bold text-accent">{myQueueOrders.length} заказов</p>
          </div>
          {myQueueOrders.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myQueueOrders.map((order) => (
                <Link key={order.id} to={`/orders/${order.id}`} className="bg-surface rounded-xl border border-border p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-accent">#{order.number}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-sm text-text-muted">{ORDER_TYPES[order.order_type]?.label} · {order.width_mm}×{order.height_mm} · {order.qty} шт</p>
                  {order.client?.name && <p className="text-xs text-text-muted mt-1">{order.client.name}</p>}
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* My assigned orders (any role) */}
      {data.myOrders.length > 0 && isManager && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-3">Мои заказы ({data.myOrders.length})</h2>
          <div className="space-y-2">
            {data.myOrders.slice(0, 5).map((order) => (
              <Link key={order.id} to={`/orders/${order.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-dim transition-colors">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm">#{order.number}</span>
                  <StatusBadge status={order.status} />
                </div>
                <span className="text-sm text-text-muted">{formatRelative(order.created_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Status cards — managers/admins */}
      {isManager && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {Object.entries(ORDER_STATUSES)
            .filter(([key]) => key !== 'cancelled')
            .map(([key, s]) => (
              <Link key={key} to="/orders" className="bg-surface rounded-xl border border-border p-4 hover:shadow-sm transition-shadow">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                <p className="text-2xl font-bold mt-2">{data.statusCounts[key] || 0}</p>
              </Link>
            ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders — managers */}
        {isManager && (
          <div className="lg:col-span-2 bg-surface rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Последние заказы</h2>
              <Link to="/orders" className="text-sm text-accent hover:underline">Все →</Link>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" />
              </div>
            ) : data.orders.length === 0 ? (
              <p className="text-text-muted text-sm py-4">Нет заказов</p>
            ) : (
              <div className="space-y-1">
                {data.orders.slice(0, 10).map((order) => (
                  <Link key={order.id} to={`/orders/${order.id}`} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-surface-dim transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-medium text-sm">#{order.number}</span>
                      <span className="text-sm text-text-muted truncate">
                        {ORDER_TYPES[order.order_type]?.label} · {order.qty} шт
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusBadge status={order.status} />
                      {isManager && <span className="text-sm font-medium">{formatPrice(order.price_final)}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sidebar */}
        <div className={`space-y-4 ${!isManager ? 'lg:col-span-3' : ''}`}>
          {/* Low stock */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Склад</h2>
            {data.lowStock.length === 0 ? (
              <p className="text-text-muted text-sm">Все материалы в норме</p>
            ) : (
              <div className="space-y-2">
                {data.lowStock.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span className="text-danger font-medium">{m.name}</span>
                    <span className="text-text-muted">{Number(m.stock_qty).toFixed(1)} / {Number(m.min_qty).toFixed(1)} {m.unit}</span>
                  </div>
                ))}
                <Link to="/warehouse" className="block text-sm text-accent hover:underline mt-2">Склад →</Link>
              </div>
            )}
          </div>

          {/* Quick actions */}
          {isManager && (
            <div className="bg-surface rounded-xl border border-border p-5">
              <h2 className="font-semibold mb-3">Быстрые действия</h2>
              <div className="space-y-2">
                <Link to="/calculator" className="block w-full bg-accent hover:bg-accent-hover text-white font-medium rounded-lg py-2.5 text-sm text-center transition-colors">
                  Калькулятор
                </Link>
                <Link to="/orders" className="block w-full border border-border text-text hover:bg-surface-dim font-medium rounded-lg py-2.5 text-sm text-center transition-colors">
                  Заказы
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
