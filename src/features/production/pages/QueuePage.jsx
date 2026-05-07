import { useState, useRef, useEffect, useMemo } from 'react'
import { useOrders } from '@/features/orders/hooks/useOrders'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { QueueCard } from '../components/QueueCard'
import { BatchView } from '../components/BatchView'
import { playNotificationSound } from '@/shared/lib/sound'
import Spinner from '@/shared/components/Spinner'
import Tabs from '@/shared/components/Tabs'
import { OnboardingTip } from '@/shared/components/OnboardingTip'

const QUEUE_CONFIG = {
  design: { title: 'Дизайн', subtitle: 'Разработка макетов', status: 'design' },
  prepress: { title: 'Препресс', subtitle: 'Допечатная подготовка', status: 'prepress' },
  print: { title: 'Печать', subtitle: 'Печать на плёнке', status: 'print' },
  lamination: { title: 'Ламинация', subtitle: 'Ламинация плёнки', status: 'lamination' },
  cutting: { title: 'Резка', subtitle: 'Плоттерная резка', status: 'cutting' },
  selection_pouring: { title: 'Выборка / Заливка', subtitle: 'Выборка фонов и заливка', status: 'selection_pouring' },
  pouring: { title: 'Заливка', subtitle: 'Заливка смолой', status: 'pouring' },
  assembly_3d: { title: 'Сборка 3D', subtitle: 'Сборка 3D стикерпаков', status: 'assembly_3d' },
  packaging: { title: 'Упаковка', subtitle: 'Упаковка готовой продукции', status: 'packaging' },
  otk: { title: 'ОТК / Выдача', subtitle: 'Контроль качества и выдача заказа', status: 'otk' },
}

const SORT_OPTIONS = [
  { key: 'deadline', label: 'По дедлайну' },
  { key: 'priority', label: 'По приоритету' },
  { key: 'created', label: 'По дате' },
]

const PRIORITY_WEIGHT = { urgent: 0, high: 1, normal: 2, low: 3 }

function sortOrders(orders, sortBy) {
  return [...orders].sort((a, b) => {
    if (sortBy === 'priority') {
      const pa = PRIORITY_WEIGHT[a.priority] ?? 2
      const pb = PRIORITY_WEIGHT[b.priority] ?? 2
      if (pa !== pb) return pa - pb
      // Same priority — sort by deadline
      if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline)
      if (a.deadline) return -1
      if (b.deadline) return 1
      return 0
    }
    if (sortBy === 'deadline') {
      if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline)
      if (a.deadline) return -1
      if (b.deadline) return 1
      return 0
    }
    // created — newest first
    return new Date(b.created_at) - new Date(a.created_at)
  })
}

export default function QueuePage({ queueType, hideHeader, enableBatchView = false }) {
  const config = QUEUE_CONFIG[queueType]
  const { profile } = useAuth()
  const { orders: allOrders, loading, refetch } = useOrders({ statuses: [config.status] })
  const [showMine, setShowMine] = useState(false)
  const [sortBy, setSortBy] = useState('deadline')
  const [viewMode, setViewMode] = useState('list')

  const orders = useMemo(() => {
    let filtered = allOrders
    if (showMine && profile) {
      filtered = filtered.filter((o) => o.assigned_to === profile.id)
    }
    return sortOrders(filtered, sortBy)
  }, [allOrders, showMine, profile, sortBy])

  const totalInQueue = allOrders.length

  const myCount = useMemo(
    () => profile ? allOrders.filter((o) => o.assigned_to === profile.id).length : 0,
    [allOrders, profile]
  )

  // Sound notification when new orders appear in queue
  const prevCountRef = useRef(totalInQueue)
  useEffect(() => {
    if (totalInQueue > prevCountRef.current) {
      playNotificationSound()
    }
    prevCountRef.current = totalInQueue
  }, [totalInQueue])

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative">
            <h1 className="text-2xl font-bold">{config.title}</h1>
            <p className="text-text-muted text-sm">
              {totalInQueue > 0
                ? `${totalInQueue} в очереди${myCount > 0 ? ` · ${myCount} моих` : ''}`
                : config.subtitle}
            </p>
            <OnboardingTip id={`queue-${queueType}-intro`}>
              Нажмите «Взять» чтобы назначить заказ на себя. Кнопка «Записать» — для внесения отчёта о проделанной работе.
            </OnboardingTip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {enableBatchView && (
              <Tabs
                items={[{ key: 'list', label: 'Список' }, { key: 'batch', label: 'Группировка' }]}
                active={viewMode}
                onChange={setViewMode}
              />
            )}
            <button
              onClick={() => setShowMine(!showMine)}
              aria-pressed={showMine}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                showMine
                  ? 'bg-accent text-on-accent shadow-sm shadow-accent/25'
                  : 'bg-surface border border-border text-text-muted hover:bg-surface-dim'
              }`}
            >
              {showMine ? `Мои (${myCount})` : 'Все'}
            </button>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Сортировка"
              className="rounded-lg border border-border px-3 py-2.5 text-sm bg-surface min-h-[44px]"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {enableBatchView && viewMode === 'batch' ? (
        <BatchView orders={orders} onUpdated={refetch} />
      ) : loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <div className="text-4xl mb-3 text-text-muted/30" aria-hidden="true">
            {showMine ? '📋' : '✓'}
          </div>
          <h3 className="text-lg font-semibold mb-1">
            {showMine ? 'Нет ваших заказов' : 'Очередь пуста'}
          </h3>
          <p className="text-text-muted text-sm">
            {showMine
              ? 'Нажмите «Все» чтобы увидеть все заказы в очереди'
              : 'Новые заказы появятся автоматически'}
          </p>
          {showMine && totalInQueue > 0 && (
            <button
              onClick={() => setShowMine(false)}
              className="mt-4 text-accent hover:text-accent-hover text-sm font-medium transition-colors min-h-[44px]"
            >
              Показать все ({totalInQueue})
            </button>
          )}
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
