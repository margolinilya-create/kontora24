import { useRef, useEffect, useMemo } from 'react'
import { useOrders } from '@/features/orders/hooks/useOrders'
import { QueueCard } from '../components/QueueCard'
import { PipelineSummary, COLS } from '../components/PipelineSummary'
import { playNotificationSound } from '@/shared/lib/sound'
import Spinner from '@/shared/components/Spinner'
import { OnboardingTip } from '@/shared/components/OnboardingTip'

const QUEUE_CONFIG = {
  design: { title: 'Очередь дизайна', subtitle: 'Заказы со статусом «Дизайн»', status: 'design' },
  prepress: { title: 'Препресс', subtitle: 'Допечатная подготовка', status: 'prepress' },
  print: { title: 'Очередь печати', subtitle: 'Заказы со статусом «Печать»', status: 'print' },
  lamination: { title: 'Ламинация', subtitle: 'Ламинация плёнки', status: 'lamination' },
  cutting: { title: 'Резка', subtitle: 'Плоттерная резка', status: 'cutting' },
  selection_pouring: { title: 'Выборка / Заливка', subtitle: 'Выборка фонов и заливка', status: 'selection_pouring' },
  pouring: { title: 'Заливка', subtitle: 'Заливка смолой', status: 'pouring' },
  assembly_3d: { title: 'Сборка 3D', subtitle: 'Сборка 3D стикерпаков', status: 'assembly_3d' },
  packaging: { title: 'Упаковка', subtitle: 'Упаковка готовой продукции', status: 'packaging' },
  otk: { title: 'ОТК / Выдача', subtitle: 'Контроль качества и выдача заказа', status: 'otk' },
}

export default function QueuePage({ queueType, hideHeader }) {
  const config = QUEUE_CONFIG[queueType]
  const { orders: allOrders, loading, refetch } = useOrders()

  const orders = useMemo(() => allOrders.filter((o) => o.status === config.status), [allOrders, config.status])

  const pipelineColumns = useMemo(() => {
    const result = {}
    for (const s of COLS) {
      result[s] = allOrders.filter((o) => o.status === s)
    }
    return result
  }, [allOrders])

  // Sound notification when new orders appear in queue
  const prevCountRef = useRef(orders.length)
  useEffect(() => {
    if (orders.length > prevCountRef.current) {
      playNotificationSound()
    }
    prevCountRef.current = orders.length
  }, [orders.length])

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="relative">
          <h1 className="text-2xl font-bold">{config.title}</h1>
          <p className="text-text-muted">
            {orders.length > 0 ? `${orders.length} заказов в работе` : config.subtitle}
          </p>
          <OnboardingTip id={`queue-${queueType}-intro`}>
            Нажмите «Взять» чтобы назначить заказ на себя. Кнопка «Записать» — для внесения отчёта о проделанной работе.
          </OnboardingTip>
        </div>
      )}

      <PipelineSummary columns={pipelineColumns} activeStatus={config.status} />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
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
