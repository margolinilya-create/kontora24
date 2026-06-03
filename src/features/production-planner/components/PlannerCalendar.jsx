// R12.3 — календарь загрузки. Колонки = рабочие дни (30), строки =
// 6 видимых бакетов. В ячейке «бакет × день» — чипы задач; фон по
// %загрузки; drying — штрихованный пассив; перегруз красным.

import { useMemo } from 'react'
import { formatOrderNumber } from '@/shared/lib/utils'
import { ORDER_STATUSES } from '@/shared/constants'
import { VISIBLE_BUCKETS, BUCKET_LABELS, BUCKETS } from '../lib/buckets'
import { usePlanStore } from '../store/plan-store'
import { useScheduleResult } from '../hooks/useScheduleResult'
import { getOrderPalette } from '../lib/order-colors'

const DOW_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

function formatDayHeader(iso) {
  const [, m, d] = iso.split('-')
  const date = new Date(`${iso}T00:00:00.000Z`)
  const dow = DOW_RU[date.getUTCDay()]
  return { date: `${d}.${m}`, dow }
}

function loadShade(hours, capacity) {
  if (!capacity) return ''
  const pct = hours / capacity
  if (pct === 0) return 'bg-white dark:bg-zinc-900'
  if (pct <= 0.85) return 'bg-emerald-50/70 dark:bg-emerald-950/30'
  if (pct <= 1.0) return 'bg-amber-50 dark:bg-amber-950/30'
  return 'bg-red-50 dark:bg-red-950/40'
}

function loadText(hours, capacity) {
  if (!capacity || hours === 0) return ''
  return `${Math.round(hours * 10) / 10}/${capacity}ч`
}

function StageChip({ item, ordersById, selectedOrderId, onSelectOrder }) {
  const order = ordersById[item.order_id]
  if (!order) return null
  const palette = getOrderPalette(order.id)
  const isSelected = selectedOrderId === order.id
  const isDimmed = selectedOrderId && !isSelected
  const label = ORDER_STATUSES[item.stage]?.label || item.stage
  return (
    <button
      type="button"
      onClick={() => onSelectOrder(isSelected ? null : order.id)}
      className={`
        block w-full text-left px-1.5 py-1 rounded text-[10px] leading-tight font-semibold
        border ${palette.bg} ${palette.border} ${palette.text}
        ${isSelected ? 'ring-2 ring-amber-500 ring-offset-1' : ''}
        ${isDimmed ? 'opacity-40' : ''}
        ${item.pinned ? 'shadow-sm' : ''}
        hover:brightness-110 transition
      `}
      title={`#${formatOrderNumber(order)} — ${label} (${Math.round(item.hours * 10) / 10}ч)${item.pinned ? ' · 📌 закреплено' : ''}`}
    >
      <span className="font-mono">#{formatOrderNumber(order)}</span>
      <span className="opacity-75"> · {label}</span>
      {item.pinned && <span className="ml-1">📌</span>}
    </button>
  )
}

function PassiveChip({ item, ordersById, selectedOrderId, onSelectOrder }) {
  const order = ordersById[item.order_id]
  if (!order) return null
  const palette = getOrderPalette(order.id)
  const isSelected = selectedOrderId === order.id
  const isDimmed = selectedOrderId && !isSelected
  return (
    <button
      type="button"
      onClick={() => onSelectOrder(isSelected ? null : order.id)}
      className={`
        block w-full text-left px-1.5 py-1 rounded text-[10px] leading-tight font-semibold
        border border-dashed ${palette.border} ${palette.text}
        bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.04)_4px,rgba(0,0,0,0.04)_8px)]
        ${isSelected ? 'ring-2 ring-amber-500 ring-offset-1' : ''}
        ${isDimmed ? 'opacity-40' : ''}
      `}
      title={`#${formatOrderNumber(order)} — сушка ${item.hours}ч (пассив)`}
    >
      <span className="font-mono">#{formatOrderNumber(order)}</span>
      <span className="opacity-75"> · сушка</span>
    </button>
  )
}

export function PlannerCalendar() {
  const orders = usePlanStore((s) => s.orders)
  const selectedOrderId = usePlanStore((s) => s.selectedOrderId)
  const setSelectedOrderId = usePlanStore((s) => s.setSelectedOrderId)
  const result = useScheduleResult()

  const ordersById = useMemo(
    () => orders.reduce((acc, o) => { acc[o.id] = o; return acc }, {}),
    [orders]
  )

  // Дедлайны заказа по дате — для флажков в шапке
  const deadlinesByDate = useMemo(() => {
    const map = {}
    for (const r of result.orders) {
      if (!r.deadlineDisplay) continue
      if (!map[r.deadlineDisplay]) map[r.deadlineDisplay] = []
      map[r.deadlineDisplay].push(r.order_id)
    }
    return map
  }, [result.orders])

  const days = result.days
  const visibleBuckets = VISIBLE_BUCKETS

  return (
    <div className="overflow-auto">
      <div
        className="grid"
        style={{ gridTemplateColumns: `140px repeat(${days.length}, minmax(96px, 1fr))` }}
      >
        {/* Шапка: пустой угол + дни */}
        <div className="sticky top-0 left-0 z-20 bg-zinc-50 dark:bg-zinc-900 border-b border-r border-zinc-200 dark:border-zinc-800 p-2 text-[11px] font-semibold uppercase text-zinc-500">
          Бакет / День
        </div>
        {days.map((d) => {
          const h = formatDayHeader(d.date)
          const deadlines = deadlinesByDate[d.date] || []
          return (
            <div
              key={d.date}
              className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-1.5 py-1 text-center"
            >
              <div className="text-[11px] font-bold">{h.date}</div>
              <div className="text-[10px] text-zinc-500 uppercase">{h.dow}</div>
              {deadlines.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-0.5 mt-0.5">
                  {deadlines.slice(0, 3).map((oid) => {
                    const palette = getOrderPalette(oid)
                    return <span key={oid} className={`inline-block w-1.5 h-1.5 rounded-full ${palette.dot}`} aria-hidden />
                  })}
                  {deadlines.length > 3 && (
                    <span className="text-[9px] text-zinc-500">+{deadlines.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Строки бакетов */}
        {visibleBuckets.map((bucket) => (
          <BucketRow
            key={bucket}
            bucket={bucket}
            days={days}
            ordersById={ordersById}
            selectedOrderId={selectedOrderId}
            onSelectOrder={setSelectedOrderId}
          />
        ))}
      </div>
    </div>
  )
}

function BucketRow({ bucket, days, ordersById, selectedOrderId, onSelectOrder }) {
  const label = BUCKET_LABELS[bucket]
  const isPassive = bucket === BUCKETS.passive
  return (
    <>
      <div className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900 border-b border-r border-zinc-200 dark:border-zinc-800 p-2 text-[11px] font-semibold uppercase text-zinc-700 dark:text-zinc-300">
        {label}
      </div>
      {days.map((d) => {
        if (isPassive) {
          const passives = d.passives || []
          return (
            <div
              key={`${bucket}-${d.date}`}
              className="border-b border-zinc-200 dark:border-zinc-800 p-1 min-h-[44px] space-y-1"
            >
              {passives.map((it, i) => (
                <PassiveChip
                  key={`${it.order_id}-${i}`}
                  item={it}
                  ordersById={ordersById}
                  selectedOrderId={selectedOrderId}
                  onSelectOrder={onSelectOrder}
                />
              ))}
            </div>
          )
        }
        const slot = d.buckets[bucket]
        if (!slot) return (
          <div key={`${bucket}-${d.date}`} className="border-b border-zinc-200 dark:border-zinc-800 p-1 min-h-[44px]" />
        )
        return (
          <div
            key={`${bucket}-${d.date}`}
            className={`relative border-b border-zinc-200 dark:border-zinc-800 p-1 min-h-[44px] space-y-1 ${loadShade(slot.hours, slot.capacity)} ${slot.overload ? 'ring-1 ring-red-400 ring-inset' : ''}`}
            title={slot.capacity ? `Загрузка: ${Math.round(slot.hours * 10) / 10} / ${slot.capacity} ч` : ''}
          >
            {slot.items.map((it, i) => (
              <StageChip
                key={`${it.order_id}-${it.stage}-${i}`}
                item={it}
                ordersById={ordersById}
                selectedOrderId={selectedOrderId}
                onSelectOrder={onSelectOrder}
              />
            ))}
            {slot.hours > 0 && (
              <div className="absolute bottom-0.5 right-1 text-[9px] font-mono text-zinc-600 dark:text-zinc-400 pointer-events-none">
                {loadText(slot.hours, slot.capacity)}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
