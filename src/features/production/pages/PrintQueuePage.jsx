import { useState } from 'react'
import QueuePage from './QueuePage'
import { BatchView } from '../components/BatchView'
import { useOrders } from '@/features/orders/hooks/useOrders'
import Tabs from '@/shared/components/Tabs'

export default function PrintQueuePage() {
  const [viewMode, setViewMode] = useState('list')
  const { orders, loading, refetch } = useOrders({ status: 'print' })

  return (
    <div className="space-y-6">
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
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <p className="text-text-muted">Нет заказов в печати</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orders.map((order) => (
            <div key={order.id}>
              {/* Using QueueCard directly instead of nesting QueuePage */}
              <QueueCardWrapper order={order} onUpdated={refetch} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Import QueueCard to render directly
import { QueueCard } from '../components/QueueCard'

function QueueCardWrapper({ order, onUpdated }) {
  return <QueueCard order={order} onUpdated={onUpdated} />
}
