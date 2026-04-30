import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { StatusBadge } from '@/features/orders/components/StatusBadge'
import { ORDER_TYPES } from '@/shared/constants'
import { formatPrice, formatDate, formatRelative } from '@/shared/lib/utils'

export default function ClientDetailPage() {
  const { id } = useParams()
  const [client, setClient] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      const [clientRes, ordersRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', id).single(),
        supabase.from('orders').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      ])
      setClient(clientRes.data)
      setOrders(ordersRes.data || [])
      setLoading(false)
    }
    if (id) fetch()
  }, [id])

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" /></div>
  }

  if (!client) {
    return <div className="text-center py-12"><h2 className="text-xl font-semibold">Клиент не найден</h2><Link to="/clients" className="text-accent hover:underline">← Клиенты</Link></div>
  }

  const totalRevenue = orders.filter((o) => o.status === 'done').reduce((s, o) => s + (Number(o.price_final) || 0), 0)
  const doneCount = orders.filter((o) => o.status === 'done').length
  const lastOrder = orders[0]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/clients" className="text-text-muted hover:text-text text-sm">← Клиенты</Link>
        <h1 className="text-2xl font-bold">{client.name}</h1>
      </div>

      {/* Info + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-5 lg:col-span-2">
          <h2 className="font-semibold mb-3">Контакты</h2>
          <div className="space-y-2 text-sm">
            {client.phone && <p><span className="text-text-muted">Телефон: </span>{client.phone}</p>}
            {client.email && <p><span className="text-text-muted">Email: </span>{client.email}</p>}
            {client.comment && <p><span className="text-text-muted">Комментарий: </span>{client.comment}</p>}
            {client.tags?.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {client.tags.map((tag) => (
                  <span key={tag} className="bg-accent/10 text-accent text-xs px-2 py-0.5 rounded-full">{tag}</span>
                ))}
              </div>
            )}
            <p className="text-text-muted text-xs">Добавлен: {formatDate(client.created_at)}</p>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border p-5">
          <p className="text-sm text-text-muted">LTV</p>
          <p className="text-2xl font-bold mt-1">{formatPrice(totalRevenue)}</p>
          <p className="text-xs text-text-muted mt-1">{doneCount} завершённых заказов</p>
        </div>

        <div className="bg-surface rounded-xl border border-border p-5">
          <p className="text-sm text-text-muted">Заказов</p>
          <p className="text-2xl font-bold mt-1">{orders.length}</p>
          {lastOrder && <p className="text-xs text-text-muted mt-1">Последний: {formatRelative(lastOrder.created_at)}</p>}
        </div>
      </div>

      {/* Orders */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">История заказов</h2>
        {orders.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-6">Нет заказов</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-text-muted">#</th>
                  <th className="text-left py-2 font-medium text-text-muted">Тип</th>
                  <th className="text-left py-2 font-medium text-text-muted">Размер</th>
                  <th className="text-left py-2 font-medium text-text-muted">Тираж</th>
                  <th className="text-left py-2 font-medium text-text-muted">Статус</th>
                  <th className="text-right py-2 font-medium text-text-muted">Цена</th>
                  <th className="text-right py-2 font-medium text-text-muted">Дата</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-dim/50">
                    <td className="py-2"><Link to={`/orders/${o.id}`} className="text-accent hover:underline font-medium">{o.number}</Link></td>
                    <td className="py-2 text-text-muted">{ORDER_TYPES[o.order_type]?.label}</td>
                    <td className="py-2 text-text-muted">{o.width_mm}×{o.height_mm}</td>
                    <td className="py-2">{o.qty}</td>
                    <td className="py-2"><StatusBadge status={o.status} /></td>
                    <td className="py-2 text-right font-medium">{formatPrice(o.price_final)}</td>
                    <td className="py-2 text-right text-text-muted">{formatDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
