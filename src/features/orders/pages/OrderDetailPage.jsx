import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrderDetail } from '../hooks/useOrders'
import { updateOrder } from '../hooks/useOrders'
import { StatusBadge } from '../components/StatusBadge'
import { StatusSwitcher } from '../components/StatusSwitcher'
import { OrderEditForm } from '../components/OrderEditForm'
import { OrderComments } from '../components/OrderComments'
import { OrderAttachments } from '../components/OrderAttachments'
import { OrderPdfExport } from '../components/OrderPdfExport'
import { OrderTimeline } from '../components/OrderTimeline'
import { TechCardActions } from '@/features/techcard/components/TechCardActions'
import { CommercialProposal } from '@/features/kp/components/CommercialProposal'
import { MaterialConsumption } from '@/features/production/components/MaterialConsumption'
import Spinner from '@/shared/components/Spinner'
import { OperationChecklist } from '@/features/production/components/OperationChecklist'
import { TaskTimer } from '@/features/production/components/TaskTimer'
import { useTimer, formatTotalTime } from '@/features/production/hooks/useTimer'
import { calculate } from '@/features/calculator/lib/calculator'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import { ORDER_TYPES, ORDER_STATUSES } from '@/shared/constants'
import { formatPrice, formatDate, formatDateTime } from '@/shared/lib/utils'

export default function OrderDetailPage() {
  const { id } = useParams()
  const { order, history, loading, refetch } = useOrderDetail(id)
  const [showKP, setShowKP] = useState(false)
  const [recalculating, setRecalculating] = useState(false)

  async function handleRecalculate() {
    if (!order) return
    setRecalculating(true)
    try {
      // Load current calculator settings and markups from DB
      const [settingsRes, markupsRes] = await Promise.all([
        supabase.from('k24_settings').select('value').eq('key', 'calculator').single(),
        supabase.from('k24_settings').select('value').eq('key', 'markups').single(),
      ])
      const overrides = settingsRes.data?.value || {}
      const markups = markupsRes.data?.value || {}

      const is3D = order.order_type?.includes('3D') || false
      const markupOverride = markups[order.order_type]

      const result = calculate({
        width: order.width_mm,
        height: order.height_mm,
        qty: order.qty,
        orderType: order.order_type,
        needLam: order.need_lam || false,
        is3D,
        overrides,
      })

      // Apply custom markup from settings if available
      let finalResult = result
      if (markupOverride && markupOverride !== result.markup) {
        const costTotal = result.costTotal
        const discount = result.discount
        const priceFinal = Math.round(costTotal * markupOverride * (1 - discount))
        const pricePerUnit = order.qty > 0 ? Math.round(priceFinal / order.qty) : 0
        finalResult = { ...result, markup: markupOverride, priceFinal, pricePerUnit }
      }

      const oldPrice = order.price_final || 0
      const newPrice = finalResult.priceFinal

      await updateOrder(order.id, {
        cost_materials: finalResult.costMaterials,
        cost_labor: finalResult.costLabor,
        cost_total: finalResult.costTotal,
        price_final: newPrice,
        price_per_unit: finalResult.pricePerUnit,
        markup: finalResult.markup,
        discount_pct: finalResult.discount,
        prod_days: finalResult.prodDays,
      })

      toast.success(`Пересчитано: было ${formatPrice(oldPrice)}, стало ${formatPrice(newPrice)}`)
      refetch()
    } catch (err) {
      toast.error('Ошибка пересчёта: ' + (err.message || 'Неизвестная ошибка'))
    } finally {
      setRecalculating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Заказ не найден</h2>
        <Link to="/orders" className="text-accent hover:underline">← К списку заказов</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/orders" className="text-text-muted hover:text-text transition-colors text-sm">
            ← Заказы
          </Link>
          <h1 className="text-2xl font-bold">Заказ #{order.number}</h1>
          <StatusBadge status={order.status} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {order.bitrix_url && (
            <a
              href={order.bitrix_url}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-2 text-sm transition-colors"
            >
              Bitrix24 ↗
            </a>
          )}
          <OrderPdfExport order={order} />
          <button
            onClick={() => setShowKP(true)}
            className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-2 text-sm transition-colors"
          >
            КП
          </button>
          <Link
            to={`/calculator?width=${order.width_mm}&height=${order.height_mm}&qty=${order.qty}&type=${order.order_type}`}
            className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-2 text-sm transition-colors"
          >
            Повторить
          </Link>
          <StatusSwitcher order={order} onUpdated={refetch} />
        </div>
      </div>

      {/* Timeline */}
      <OrderTimeline order={order} history={history} />

      {/* Tech Card */}
      <TechCardActions order={order} />

      {/* Commercial Proposal Modal */}
      {showKP && <CommercialProposal order={order} onClose={() => setShowKP(false)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Order params */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-4">Параметры заказа</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <InfoField label="Тип" value={ORDER_TYPES[order.order_type]?.label || order.order_type} />
              <InfoField label="Размер" value={`${order.width_mm} × ${order.height_mm} мм`} />
              <InfoField label="Тираж" value={`${order.qty} шт`} />
              <InfoField label="Кол-во видов" value={order.design_variants || 1} />
              <InfoField label="Ламинация" value={order.need_lam ? (order.lam_type || 'Да') : 'Нет'} />
              <InfoField label="Срок" value={`${order.prod_days || '—'} дн.`} />
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Стоимость</h2>
              <button
                onClick={handleRecalculate}
                disabled={recalculating}
                aria-label="Пересчитать стоимость заказа"
                className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {recalculating && <Spinner size="xs" className="border-current" />}
                Пересчитать
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <PriceCard label="Материалы" value={order.cost_materials} />
              <PriceCard label="Труд" value={order.cost_labor} />
              <PriceCard label="Себестоимость" value={order.cost_total} />
              <PriceCard label="Итого" value={order.price_final} highlight />
            </div>
            <div className="flex gap-6 mt-4 text-sm text-text-muted">
              <span>Наценка: ×{order.markup || '—'}</span>
              <span>Скидка: {order.discount_pct ? `${(order.discount_pct * 100).toFixed(0)}%` : '—'}</span>
              <span>За штуку: {formatPrice(order.price_per_unit)}</span>
            </div>
          </div>

          {/* Operation Checklist */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Операции</h2>
            <OperationChecklist order={order} />
          </div>

          {/* Material Consumption */}
          <MaterialConsumption order={order} />

          {/* Notes */}
          {order.notes && (
            <div className="bg-surface rounded-xl border border-border p-5">
              <h2 className="font-semibold mb-2">Заметки</h2>
              <p className="text-sm text-text-muted whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}

          {/* Edit form */}
          <OrderEditForm order={order} onSaved={refetch} />

          {/* Attachments */}
          <OrderAttachments orderId={order.id} />

          {/* Comments */}
          <OrderComments orderId={order.id} />

          {/* Time tracking */}
          <TimeTrackingSection orderId={order.id} orderStatus={order.status} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Client */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Клиент</h2>
            {order.client ? (
              <div className="text-sm space-y-1">
                <Link to={`/clients/${order.client_id}`} className="font-medium text-accent hover:underline">{order.client.name}</Link>
                {order.client.phone && <p className="text-text-muted">{order.client.phone}</p>}
                {order.client.email && <p className="text-text-muted">{order.client.email}</p>}
              </div>
            ) : (
              <p className="text-sm text-text-muted">Не указан</p>
            )}
          </div>

          {/* Meta */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Информация</h2>
            <div className="text-sm space-y-2">
              <InfoField label="Создан" value={formatDateTime(order.created_at)} />
              <InfoField label="Обновлён" value={formatDateTime(order.updated_at)} />
              {order.deadline && <InfoField label="Дедлайн" value={formatDate(order.deadline)} />}
              <InfoField label="Создал" value={order.creator?.display_name || '—'} />
              <InfoField label="Исполнитель" value={order.assignee?.display_name || 'Не назначен'} />
            </div>
          </div>

          {/* Status history */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">История статусов</h2>
            {history.length === 0 ? (
              <p className="text-sm text-text-muted">Нет записей</p>
            ) : (
              <div className="space-y-3">
                {history.map((h) => (
                  <div key={h.id} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                    <div>
                      <p>
                        {h.from_status ? (
                          <>
                            <span className="text-text-muted">{ORDER_STATUSES[h.from_status]?.label}</span>
                            {' → '}
                          </>
                        ) : null}
                        <span className="font-medium">{ORDER_STATUSES[h.to_status]?.label || h.to_status}</span>
                      </p>
                      <p className="text-xs text-text-muted">
                        {h.changed_by_profile?.display_name} · {formatDateTime(h.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-text-muted text-xs">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function PriceCard({ label, value, highlight }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-accent/10 border border-accent/20' : 'bg-surface-dim'}`}>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-accent' : ''}`}>
        {formatPrice(value)}
      </p>
    </div>
  )
}

function TimeTrackingSection({ orderId, orderStatus }) {
  const { entries } = useTimer(orderId)

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Время работы</h2>
      <TaskTimer orderId={orderId} orderStatus={orderStatus} />
      {entries.length > 0 && (
        <div className="mt-4 space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
              <span className="text-text-muted">{formatDateTime(entry.started_at)}</span>
              <span>{entry.duration_minutes ? formatTotalTime(entry.duration_minutes) : 'В процессе'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
