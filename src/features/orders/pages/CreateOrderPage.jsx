// Страница /orders/create. R25.6: сама форма — общий компонент CreateOrderForm
// (тот же используется в попапе «Создать заказ» калькулятора).
// R28.1: /orders/create?deal=<id> — заказ из сделки CRM: поля предзаполняются
// из сделки, заказ получает deal_id. Без параметра — поведение как раньше.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from '@/shared/stores/toast-store'
import { formatOrderNumber } from '@/shared/lib/utils'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import Spinner from '@/shared/components/Spinner'
import { CreateOrderForm } from '../components/CreateOrderForm'
import { getDeal } from '@/features/crm/lib/deals-api'
import { orderPrefillFromDeal } from '@/features/crm/lib/deals'

export default function CreateOrderPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const dealId = params.get('deal')
  // Форма фиксирует начальные значения при монтировании → ждём сделку до рендера.
  const [dealState, setDealState] = useState(() => ({ loading: !!dealId, deal: null }))

  useEffect(() => {
    if (!dealId) return undefined
    let cancelled = false
    getDeal(dealId)
      .then((deal) => { if (!cancelled) setDealState({ loading: false, deal }) })
      .catch((err) => {
        captureError(err, { tags: { source: 'CreateOrderPage.loadDeal' } })
        toast.error(`Сделка не загрузилась: ${translateError(err).message}`)
        if (!cancelled) setDealState({ loading: false, deal: null })
      })
    return () => { cancelled = true }
  }, [dealId])

  const deal = dealState.deal
  const initialValues = useMemo(() => (deal ? orderPrefillFromDeal(deal) : undefined), [deal])

  function handleCreated(order) {
    toast.success(`Заказ ${formatOrderNumber(order)} создан`)
    navigate(`/orders/${order.id}`)
  }

  if (dealState.loading) return <Spinner />

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Новый заказ</h1>
          <p className="text-text-muted text-sm">
            {deal ? `По сделке № ${deal.number} «${deal.title}»` : 'Заполните параметры и создайте заказ'}
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Bitrix24 пока не подключён"
          className="border border-border bg-surface text-text-muted/60 rounded-lg px-3 py-2 text-sm cursor-not-allowed"
        >
          Заполнить из Bitrix
        </button>
      </div>

      <CreateOrderForm
        key={deal?.id || 'plain'}
        initialValues={initialValues}
        buildExtraOrderData={deal ? () => ({ deal_id: deal.id }) : undefined}
        onCreated={handleCreated}
        onCancel={() => navigate(deal ? `/crm/deals/${deal.id}` : '/orders')}
      />
    </div>
  )
}
