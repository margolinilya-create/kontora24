import { useOrders } from '@/features/orders/hooks/useOrders'
import { QueueCard } from '../components/QueueCard'

export default function DesignQueuePage() {
  const { orders, loading, refetch } = useOrders({ status: 'design' })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Очередь дизайна</h1>
        <p className="text-text-muted">
          {orders.length > 0 ? `${orders.length} заказов в работе` : 'Заказы со статусом «Дизайн»'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <p className="text-text-muted">Нет заказов в очереди дизайна</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orders.map((order) => (
            <QueueCard key={order.id} order={order} onUpdated={refetch} />
          ))}
        </div>
      )}
    </div>
  )
}
