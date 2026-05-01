import { useState } from 'react'
import QueuePage from './QueuePage'
import { BatchView } from '../components/BatchView'
import { useOrders } from '@/features/orders/hooks/useOrders'
import Tabs from '@/shared/components/Tabs'

export default function PrintQueuePage() {
  const [viewMode, setViewMode] = useState('list') // 'list' | 'batch'
  const { orders, refetch } = useOrders({ status: 'print' })

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
      ) : (
        <QueuePage queueType="print" hideHeader />
      )}
    </div>
  )
}
