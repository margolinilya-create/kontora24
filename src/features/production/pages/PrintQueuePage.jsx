import { useState } from 'react'
import { BatchView } from '../components/BatchView'
import { QueueCard } from '../components/QueueCard'
import { useOrders } from '@/features/orders/hooks/useOrders'
import Tabs from '@/shared/components/Tabs'
import Spinner from '@/shared/components/Spinner'

export default function PrintQueuePage() {
  const [viewMode, setViewMode] = useState('list')
  const { orders, loading, refetch } = useOrders({ statuses: ['print'] })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Очередь печати</h1>
          <p className="text-text-muted">{orders.length} заказов в печати</p>
        </div>
        <Tabs
          items={[{ key: 'list', label: 'Список' }, { key: 'batch', label: 'Группировка' }]}
          active={viewMode}
          onChange={setViewMode}
        />
      </div>

      {viewMode === 'batch' ? (
        <BatchView orders={orders} onUpdated={refetch} />
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <p className="text-text-muted">Нет заказов в печати</p>
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
