import { useRef, useEffect } from 'react'
import { useOrders } from '@/features/orders/hooks/useOrders'
import { QueueCard } from '../components/QueueCard'
import { playNotificationSound } from '@/shared/lib/sound'

const QUEUE_CONFIG = {
  design: { title: 'Очередь дизайна', subtitle: 'Заказы со статусом «Дизайн»', status: 'design' },
  print: { title: 'Очередь печати', subtitle: 'Заказы со статусом «Печать»', status: 'print' },
  resin_pouring: { title: 'Заливка смолой', subtitle: 'Заказы на заливке смолой', status: 'resin_pouring' },
  assembly: { title: 'Очередь сборки', subtitle: 'Заказы со статусом «Сборка»', status: 'assembly' },
}

export default function QueuePage({ queueType, hideHeader }) {
  const config = QUEUE_CONFIG[queueType]
  const { orders, loading, refetch } = useOrders({ status: config.status })

  // Sound notification when new orders appear in queue
  const prevCountRef = useRef(orders.length)
  useEffect(() => {
    if (orders.length > prevCountRef.current) {
      playNotificationSound()
    }
    prevCountRef.current = orders.length
  }, [orders.length])

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div>
          <h1 className="text-2xl font-bold">{config.title}</h1>
          <p className="text-text-muted">
            {orders.length > 0 ? `${orders.length} заказов в работе` : config.subtitle}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <p className="text-text-muted">Нет заказов в очереди</p>
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
