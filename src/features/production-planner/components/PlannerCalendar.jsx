// R12.3 + R12.4 + R12.5 — календарь загрузки. Колонки = рабочие дни (30),
// строки = 6 видимых бакетов. Чипы draggable, ячейки droppable;
// дроп в ячейку другого бакета запрещён (мы можем двигать только время,
// не отдел). При выборе заказа его колонка-дедлайн подсвечивается
// золотом по всем дорожкам (§10.4 ТЗ).

import { useMemo } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { formatOrderNumber } from '@/shared/lib/utils'
import { ORDER_STATUSES } from '@/shared/constants'
import { VISIBLE_BUCKETS, BUCKET_LABELS, BUCKETS } from '../lib/buckets'
import { usePlanStore } from '../store/plan-store'
import { useScheduleResult } from '../hooks/useScheduleResult'
import { getOrderPalette } from '../lib/order-colors'
import { makeDragId, makeDropId } from '../lib/dnd-ids'

const DOW_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

function formatDayHeader(iso) {
  const [, m, d] = iso.split('-')
  const date = new Date(`${iso}T00:00:00.000Z`)
  const dow = DOW_RU[date.getUTCDay()]
  return { date: `${d}.${m}`, dow }
}

function loadShade(hours, capacity, isOver, droppable) {
  if (droppable && isOver) return 'bg-amber-100 dark:bg-amber-900/30'
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
  const dragId = makeDragId(item.order_id, item.stage)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId })
  if (!order) return null
  const palette = getOrderPalette(order.id)
  const isSelected = selectedOrderId === order.id
  const isDimmed = selectedOrderId && !isSelected
  const label = ORDER_STATUSES[item.stage]?.label || item.stage
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={(e) => {
        // dnd-kit может сожрать клик при start drag — не обрабатываем
        // если в момент клика мы тащим
        if (isDragging) return
        e.stopPropagation()
        onSelectOrder(isSelected ? null : order.id)
      }}
      {...listeners}
      {...attributes}
      className={`
        block w-full text-left px-1.5 py-1 rounded text-[10px] leading-tight font-semibold
        border ${palette.bg} ${palette.border} ${palette.text}
        ${isSelected ? 'ring-2 ring-amber-500 ring-offset-1' : ''}
        ${isDimmed ? 'opacity-40' : ''}
        ${item.pinned ? 'shadow-sm' : ''}
        ${isDragging ? 'opacity-0' : ''}
        cursor-grab active:cursor-grabbing hover:brightness-110 transition
      `}
      title={`#${formatOrderNumber(order)} — ${label} (${Math.round(item.hours * 10) / 10}ч)${item.pinned ? ' · 📌 закреплено' : ''}\nЗажмите и тащите чтобы перенести на другой день.`}
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

// Лёгкий компонент для отрисовки чипа в DragOverlay (без useDraggable).
export function DragOverlayChip({ orderId, stage, hours, ordersById }) {
  const order = ordersById[orderId]
  if (!order) return null
  const palette = getOrderPalette(order.id)
  const label = ORDER_STATUSES[stage]?.label || stage
  return (
    <div
      className={`px-1.5 py-1 rounded text-[10px] leading-tight font-semibold
        border ${palette.bg} ${palette.border} ${palette.text} shadow-xl ring-2 ring-amber-500`}
      style={{ width: 'fit-content' }}
    >
      <span className="font-mono">#{formatOrderNumber(order)}</span>
      <span className="opacity-75"> · {label}</span>
      <span className="opacity-50 ml-1">({Math.round(hours * 10) / 10}ч)</span>
    </div>
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

  // Дедлайн выбранного заказа (для золотой подсветки колонки)
  const selectedDeadline = selectedOrderId
    ? result.byOrder[selectedOrderId]?.deadlineDisplay
    : null

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
          const isSelectedDeadline = d.date === selectedDeadline
          return (
            <div
              key={d.date}
              className={`sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800 px-1.5 py-1 text-center
                ${isSelectedDeadline ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-zinc-50 dark:bg-zinc-900'}`}
            >
              <div className="text-[11px] font-bold">{h.date}</div>
              <div className="text-[10px] text-zinc-500 uppercase">{h.dow}</div>
              {isSelectedDeadline && selectedOrderId && (
                <div className="text-[9px] font-bold text-amber-800 mt-0.5">
                  🚩 #{formatOrderNumber(ordersById[selectedOrderId] || {})}
                </div>
              )}
              {deadlines.length > 0 && !isSelectedDeadline && (
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
            selectedDeadline={selectedDeadline}
            onSelectOrder={setSelectedOrderId}
          />
        ))}
      </div>
    </div>
  )
}

function BucketRow({ bucket, days, ordersById, selectedOrderId, selectedDeadline, onSelectOrder }) {
  const label = BUCKET_LABELS[bucket]
  const isPassive = bucket === BUCKETS.passive
  return (
    <>
      <div className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-900 border-b border-r border-zinc-200 dark:border-zinc-800 p-2 text-[11px] font-semibold uppercase text-zinc-700 dark:text-zinc-300">
        {label}
      </div>
      {days.map((d) => {
        const isDeadlineCol = d.date === selectedDeadline
        if (isPassive) {
          const passives = d.passives || []
          return (
            <div
              key={`${bucket}-${d.date}`}
              className={`border-b border-zinc-200 dark:border-zinc-800 p-1 min-h-[44px] space-y-1
                ${isDeadlineCol ? 'bg-amber-50 dark:bg-amber-950/30 border-l border-r border-dashed border-amber-400' : ''}`}
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
          <DroppableCell
            key={`${bucket}-${d.date}`}
            bucket={bucket}
            date={d.date}
            slot={slot}
            isDeadlineCol={isDeadlineCol}
            ordersById={ordersById}
            selectedOrderId={selectedOrderId}
            onSelectOrder={onSelectOrder}
          />
        )
      })}
    </>
  )
}

function DroppableCell({ bucket, date, slot, isDeadlineCol, ordersById, selectedOrderId, onSelectOrder }) {
  const { setNodeRef, isOver } = useDroppable({ id: makeDropId(bucket, date) })
  return (
    <div
      ref={setNodeRef}
      className={`relative border-b border-zinc-200 dark:border-zinc-800 p-1 min-h-[44px] space-y-1
        ${loadShade(slot.hours, slot.capacity, isOver, true)}
        ${slot.overload ? 'ring-1 ring-red-400 ring-inset' : ''}
        ${isDeadlineCol ? 'border-l border-r border-dashed border-amber-400' : ''}
        ${isOver ? 'ring-2 ring-amber-500 ring-inset' : ''}`}
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
}
