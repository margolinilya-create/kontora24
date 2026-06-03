// R12.6 — панель деталей заказа (выезжает справа). Открывается когда
// в сторе selectedOrderId !== null. Содержит: блоки «🚩 Срок» и
// «Прогноз», мини-поля заказа, расход материалов, список этапов
// со статусами, кнопку «Снять закрепления заказа».

import { Link } from 'react-router-dom'
import { formatOrderNumber } from '@/shared/lib/utils'
import { ORDER_STATUSES, ORDER_TYPES, FILM_TYPES, LAMINATION_TYPES } from '@/shared/constants'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { forecastMaterials } from '@/features/orders/lib/material-forecast'
import { usePlanStore } from '../store/plan-store'
import { useScheduleResult } from '../hooks/useScheduleResult'
import { getOrderPalette } from '../lib/order-colors'
import { BUCKETS } from '../lib/buckets'
import { unpinAllForOrder } from '../lib/plan-overrides'

function formatDate(iso) {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

function daysBetween(aIso, bIso) {
  if (!aIso || !bIso) return 0
  const a = new Date(`${aIso}T00:00:00.000Z`).getTime()
  const b = new Date(`${bIso}T00:00:00.000Z`).getTime()
  return Math.round((a - b) / 86400000)
}

function ForecastBadge({ label, expected, unit }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 rounded bg-zinc-50 dark:bg-zinc-900 text-xs">
      <span className="text-zinc-600 dark:text-zinc-400 truncate pr-2">{label}</span>
      <span className="font-mono font-bold tabular-nums">
        {Math.round(expected * 100) / 100} {unit}
      </span>
    </div>
  )
}

function StagesList({ stages }) {
  return (
    <ul className="space-y-1">
      {stages.map((ps) => {
        const label = ORDER_STATUSES[ps.stage]?.label || ps.stage
        const isPlanned = ps.days && ps.days.length > 0
        const isMilestone = ps.bucket === BUCKETS.milestone
        const isPassive = ps.bucket === BUCKETS.passive
        return (
          <li key={ps.stage} className="flex items-center justify-between text-[12px] py-1 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-1.5 h-1.5 rounded-full
                ${isMilestone ? 'bg-zinc-300' : isPassive ? 'bg-amber-400' : isPlanned ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
              <span className="font-medium">{label}</span>
              {ps.pinned && <span title="закреплено вручную">📌</span>}
            </div>
            <div className="text-zinc-500 text-[11px]">
              {isMilestone ? 'веха' : isPassive ? `пассив ${ps.hours ? Math.round(ps.hours) + 'ч' : ''}` : isPlanned ? (
                <>
                  {Math.round(ps.hours * 10) / 10}ч ·{' '}
                  {ps.days.length > 1 ? `${formatDate(ps.days[0])}–${formatDate(ps.days[ps.days.length - 1])}` : formatDate(ps.days[0])}
                </>
              ) : '—'}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function OrderDetailsPanel() {
  const selectedOrderId = usePlanStore((s) => s.selectedOrderId)
  const setSelectedOrderId = usePlanStore((s) => s.setSelectedOrderId)
  const orders = usePlanStore((s) => s.orders)
  const items = usePlanStore((s) => s.items)
  const overrides = usePlanStore((s) => s.overrides)
  const result = useScheduleResult()
  const canSeeFinance = useCanDo('view:finance')

  if (!selectedOrderId) return null
  const order = orders.find((o) => o.id === selectedOrderId)
  if (!order) return null

  const r = result.byOrder[selectedOrderId]
  const palette = getOrderPalette(order.id)
  const isRush = order.priority === 'urgent' || order.is_urgent
  const typeLabel = ORDER_TYPES[order.order_type]?.label || order.order_type
  const filmLabel = order.film_type ? (FILM_TYPES[order.film_type]?.label || order.film_type) : '—'
  const lamLabel = order.lam_type ? (LAMINATION_TYPES[order.lam_type]?.label || order.lam_type) : 'без'
  const designSource = order.design_status === 'provided' ? 'клиент' : 'разработка'
  const myItems = items.filter((it) => it.order_id === order.id)
  const orderOverrides = overrides.filter((o) => o.order_id === order.id)

  const forecast = forecastMaterials({
    orderType: order.order_type,
    widthMm: order.width_mm,
    heightMm: order.height_mm,
    qty: order.qty,
    filmType: order.film_type,
    lamType: order.lam_type,
    boppBag: order.bopp_bag,
    items: myItems.length > 0 ? myItems.map((it) => ({
      widthMm: it.width_mm, heightMm: it.height_mm, qty: it.qty,
    })) : null,
  })

  const finishStatus = r?.late ? 'late' : r?.risk ? 'risk' : 'ok'
  const finishLabel = !r?.finishDay ? '—'
    : finishStatus === 'late' ? (r.outOfHorizon ? 'не влезает в горизонт'
      : `опоздаем на ${daysBetween(r.finishDay, r.deadlineDisplay)} дн.`)
    : finishStatus === 'risk' ? 'впритык'
    : 'в срок'
  const finishBg = finishStatus === 'late' ? 'bg-red-50 border-red-300 text-red-800'
    : finishStatus === 'risk' ? 'bg-amber-50 border-amber-300 text-amber-800'
    : 'bg-emerald-50 border-emerald-300 text-emerald-800'

  async function handleClearPins() {
    const res = await unpinAllForOrder(order.id)
    if (res.ok && res.removed) {
      // realtime сам обновит, но даём моментально
    }
  }

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={() => setSelectedOrderId(null)}
        className="fixed inset-0 bg-black/30 z-40"
      />
      {/* Panel */}
      <aside
        className="fixed right-0 top-14 bottom-0 w-full sm:w-[420px] bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 z-50 overflow-y-auto shadow-2xl"
        role="dialog"
        aria-label={`Детали заказа ${formatOrderNumber(order)}`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${palette.dot}`} aria-hidden />
          <h2 className="text-base font-bold">
            <Link to={`/orders/${order.id}`} className="hover:underline">
              #{formatOrderNumber(order)}
            </Link>
          </h2>
          {isRush && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700">
              срочно
            </span>
          )}
          <button
            type="button"
            onClick={() => setSelectedOrderId(null)}
            className="ml-auto text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition text-2xl leading-none"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Срок + Прогноз */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
              <div className="text-[10px] uppercase font-semibold text-amber-700">🚩 Срок (менеджер)</div>
              <div className="text-lg font-bold text-amber-900 tabular-nums">{formatDate(r?.deadlineDisplay)}</div>
            </div>
            <div className={`rounded-lg border px-3 py-2 ${finishBg}`}>
              <div className="text-[10px] uppercase font-semibold opacity-80">Прогноз готовности</div>
              <div className="text-lg font-bold tabular-nums">{formatDate(r?.finishDay)}</div>
              <div className="text-[10px] font-semibold opacity-80">{finishLabel}</div>
            </div>
          </div>

          {/* Мини-поля */}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
            <Field label="Клиент" value={order.client?.name || order.client_name || '—'} />
            <Field label="Тираж" value={`${order.qty || 0} шт`} />
            <Field label="Размер" value={`${order.width_mm}×${order.height_mm} мм`} />
            <Field label="Тип" value={typeLabel} />
            <Field label="Плёнка" value={filmLabel} />
            <Field label="Ламинация" value={lamLabel} />
            <Field label="Макет" value={designSource} />
            {order.order_type === 'stickerpack' || order.order_type === 'stickerpack3D' ? (
              <Field label="Стикеров в паке" value={order.stickers_per_pack || 1} />
            ) : null}
            {canSeeFinance && order.price_final ? (
              <Field label="Бюджет" value={`${Math.round(order.price_final).toLocaleString('ru')} ₽`} />
            ) : null}
            {myItems.length > 1 ? (
              <Field label="Виды изделий" value={`${myItems.length}`} />
            ) : null}
          </dl>

          {/* Расход материалов */}
          {forecast.length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-500 mb-1.5">
                Расход на тираж
              </div>
              <div className="space-y-1">
                {forecast.map((f) => (
                  <ForecastBadge key={f.key} label={f.label} expected={f.expected} unit={f.unit} />
                ))}
              </div>
            </div>
          )}

          {/* Этапы */}
          {r?.plannedStages && r.plannedStages.length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-semibold text-zinc-500 mb-1.5">
                Этапы маршрута
              </div>
              <StagesList stages={r.plannedStages} />
            </div>
          )}

          {/* Действия */}
          {orderOverrides.length > 0 && (
            <button
              type="button"
              onClick={handleClearPins}
              className="w-full px-3 py-2 text-[12px] font-semibold rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
            >
              Снять закрепления ({orderOverrides.length})
            </button>
          )}
        </div>
      </aside>
    </>
  )
}

function Field({ label, value }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{value}</dd>
    </>
  )
}
