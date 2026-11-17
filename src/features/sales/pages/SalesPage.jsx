import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useOrders } from '@/features/orders/hooks/useOrders'
import QueuePage from '@/features/production/pages/QueuePage'
import { SALES_STAGES } from '@/shared/constants'

// R25.1 (ТЗ 17.11, 1.7): раздел «Продажи» — все заказы, ждущие действий
// менеджера. Вкладка = очередь этапа (переиспользуется QueuePage, сортировка
// по сроку). Счётчики — по одному запросу активных заказов этих этапов.
const TAB_LABELS = {
  new: 'Новые',
  awaiting_payment: 'Ждут оплаты',
  design_approval: 'Утверждение дизайна',
  color_approval: 'Утверждение цвета',
  subcontract: 'Субподряд',
  awaiting_pickup: 'Ждут выдачи',
  delivery: 'Доставка',
}

export default function SalesPage() {
  const [params, setParams] = useSearchParams()
  const active = SALES_STAGES.includes(params.get('tab')) ? params.get('tab') : SALES_STAGES[0]
  const { orders } = useOrders({ statuses: SALES_STAGES })

  const counts = useMemo(() => {
    const c = {}
    for (const o of orders) c[o.status] = (c[o.status] || 0) + 1
    return c
  }, [orders])

  function selectTab(key) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', key)
      return next
    }, { replace: true })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight">Продажи</h1>
        <p className="text-text-muted text-sm">Заказы, ждущие действий отдела продаж</p>
      </div>

      <div className="-mx-4 px-4 overflow-x-auto sm:mx-0 sm:px-0">
        <div role="tablist" className="inline-flex gap-1 bg-surface-2 rounded-xl p-1 whitespace-nowrap">
          {SALES_STAGES.map((key) => {
            const isActive = key === active
            const count = counts[key] || 0
            return (
              <button
                key={key}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectTab(key)}
                className={`px-3.5 py-1.5 min-h-[40px] rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition-[background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  isActive ? 'bg-accent text-on-accent' : 'text-text-muted hover:text-text hover:bg-surface'
                }`}
              >
                {TAB_LABELS[key]}
                <span className={`text-xs min-w-[20px] px-1.5 rounded-full text-center ${
                  isActive ? 'bg-on-accent/20' : count > 0 ? 'bg-info/15 text-info' : 'bg-surface text-text-muted'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <QueuePage key={active} queueType={active} hideHeader />
    </div>
  )
}
