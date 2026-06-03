// R12.3 + R12.4 + R12.5 — календарь загрузки. Колонки = рабочие дни (30),
// строки = 6 видимых бакетов. Чипы draggable, ячейки droppable;
// дроп в ячейку другого бакета запрещён (мы можем двигать только время,
// не отдел). При выборе заказа его колонка-дедлайн подсвечивается
// золотом по всем дорожкам (§10.4 ТЗ).

import { useMemo } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { formatOrderNumber } from '@/shared/lib/utils'
import { ORDER_STATUSES } from '@/shared/constants'
import { stageBadgeClasses, stageBorderClass } from '@/shared/lib/department-mapping'
import { VISIBLE_BUCKETS, BUCKET_LABELS, BUCKETS } from '../lib/buckets'
import { usePlanStore } from '../store/plan-store'
import { useScheduleResult } from '../hooks/useScheduleResult'
import { getOrderPalette } from '../lib/order-colors'
import { makeDragId, makeDropId } from '../lib/dnd-ids'

const DOW_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const WEEKEND_GAP_PX = 14

function formatDayHeader(iso) {
  const [, m, d] = iso.split('-')
  const date = new Date(`${iso}T00:00:00.000Z`)
  const dow = DOW_RU[date.getUTCDay()]
  return { date: `${d}.${m}`, dow }
}

// R14 (полировка визуала): между двумя соседними рабочими днями с разрывом > 1
// добавляем виртуальную «gap»-колонку шириной 14px с подписью «сб–вс». Она
// рендерится в той же CSS grid, но не имеет useDroppable.
function daysWithGaps(days) {
  const out = []
  for (let i = 0; i < days.length; i += 1) {
    out.push({ type: 'day', day: days[i] })
    if (i < days.length - 1) {
      const cur = new Date(`${days[i].date}T00:00:00.000Z`).getTime()
      const next = new Date(`${days[i + 1].date}T00:00:00.000Z`).getTime()
      const dayDiff = Math.round((next - cur) / 86400000)
      if (dayDiff > 1) {
        out.push({ type: 'gap', key: `gap-${days[i].date}` })
      }
    }
  }
  return out
}

function loadShade(hours, capacity, isOver, droppable) {
  if (droppable && isOver) return 'bg-warning/25'
  if (!capacity) return ''
  const pct = hours / capacity
  if (pct === 0) return 'bg-surface'
  if (pct <= 0.85) return 'bg-success/15'
  if (pct <= 1.0) return 'bg-warning/15'
  return 'bg-danger/15'
}

function loadText(hours, capacity) {
  if (!capacity || hours === 0) return ''
  return `${Math.round(hours * 10) / 10}/${capacity}ч`
}

function loadPct(hours, capacity) {
  if (!capacity || !hours) return 0
  return Math.round((hours / capacity) * 100)
}

const TODAY_ISO = new Date().toISOString().slice(0, 10)

function StageChip({ item, ordersById, selectedOrderId, onSelectOrder }) {
  const order = ordersById[item.order_id]
  const dragId = makeDragId(item.order_id, item.stage)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId })
  if (!order) return null
  const palette = getOrderPalette(order.id)
  const isSelected = selectedOrderId === order.id
  const isDimmed = selectedOrderId && !isSelected
  const label = ORDER_STATUSES[item.stage]?.label || item.stage
  // R14 гибрид: фон/бордер/текст по департаменту стадии, левая полоска — по заказу.
  const stageClasses = stageBadgeClasses(item.stage) // bg-dept-*/15 text-dept-*
  const stageBorder = stageBorderClass(item.stage)
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
        relative block w-full text-left pl-2.5 pr-1.5 py-1 rounded text-[10px] leading-tight font-semibold
        border ${stageClasses} ${stageBorder} border-opacity-40
        ${isSelected ? 'ring-2 ring-info ring-offset-1 shadow-md scale-[1.02] z-10' : ''}
        ${isDimmed ? 'opacity-25 saturate-50' : ''}
        ${item.pinned ? 'shadow-sm' : ''}
        ${isDragging ? 'opacity-0' : ''}
        cursor-grab active:cursor-grabbing hover:brightness-105 transition
      `}
      title={`#${formatOrderNumber(order)} — ${label} (${Math.round(item.hours * 10) / 10}ч)${item.pinned ? ' · 📌 закреплено' : ''}\nЗажмите и тащите чтобы перенести на другой день.`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l ${palette.dot}`} aria-hidden />
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
  // R14: пассив (сушка) — собственный цвет «dept-pouring» с штриховкой.
  const stageClasses = stageBadgeClasses('drying')
  const stageBorder = stageBorderClass('drying')
  return (
    <button
      type="button"
      onClick={() => onSelectOrder(isSelected ? null : order.id)}
      className={`
        relative block w-full text-left pl-2.5 pr-1.5 py-1 rounded text-[10px] leading-tight font-semibold
        border border-dashed ${stageClasses} ${stageBorder} border-opacity-40
        bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.04)_4px,rgba(0,0,0,0.04)_8px)]
        ${isSelected ? 'ring-2 ring-info ring-offset-1 shadow-md scale-[1.02] z-10' : ''}
        ${isDimmed ? 'opacity-25 saturate-50' : ''}
      `}
      title={`#${formatOrderNumber(order)} — сушка ${item.hours}ч (пассив)`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l ${palette.dot}`} aria-hidden />
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
  const stageClasses = stageBadgeClasses(stage)
  const stageBorder = stageBorderClass(stage)
  return (
    <div
      className={`relative pl-2.5 pr-1.5 py-1 rounded text-[10px] leading-tight font-semibold
        border ${stageClasses} ${stageBorder} border-opacity-40 shadow-xl ring-2 ring-info`}
      style={{ width: 'fit-content' }}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l ${palette.dot}`} aria-hidden />
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

  // R14.3: вставляем gap-колонки между рабочими днями с разрывом > 1 (выходные / праздники)
  const layout = useMemo(() => daysWithGaps(days), [days])
  const gridTemplate = useMemo(() => {
    const parts = ['140px']
    for (const slot of layout) {
      parts.push(slot.type === 'gap' ? `${WEEKEND_GAP_PX}px` : 'minmax(96px, 1fr)')
    }
    return parts.join(' ')
  }, [layout])

  return (
    <div className="overflow-auto">
      <div
        className="grid"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {/* Шапка: пустой угол + дни */}
        <div className="sticky top-0 left-0 z-20 bg-surface-dim border-b border-r border-border p-2 text-[11px] font-semibold uppercase text-text-muted">
          Бакет / День
        </div>
        {layout.map((slot) => {
          if (slot.type === 'gap') {
            return (
              <div
                key={slot.key}
                className="sticky top-0 z-10 border-b border-border bg-surface-dim flex items-center justify-center"
                aria-hidden
              >
                <span
                  className="text-[9px] font-semibold uppercase text-text-muted tracking-wider"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  сб–вс
                </span>
              </div>
            )
          }
          const d = slot.day
          const h = formatDayHeader(d.date)
          const deadlines = deadlinesByDate[d.date] || []
          const isSelectedDeadline = d.date === selectedDeadline
          const isToday = d.date === TODAY_ISO
          return (
            <div
              key={d.date}
              className={`sticky top-0 z-10 border-b border-border px-1.5 py-1 text-center
                ${isSelectedDeadline ? 'bg-info/10' : isToday ? 'bg-accent/15 ring-2 ring-accent/40 ring-inset' : 'bg-surface-dim'}`}
            >
              <div className={`text-[11px] font-bold ${isToday ? 'text-accent-hover' : ''}`}>{h.date}</div>
              <div className={`text-[10px] uppercase ${isToday ? 'text-accent-hover font-semibold' : 'text-text-muted'}`}>{h.dow}</div>
              {isSelectedDeadline && selectedOrderId && (
                <div className="text-[9px] font-bold text-info mt-0.5">
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
                    <span className="text-[9px] text-text-muted">+{deadlines.length - 3}</span>
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
            layout={layout}
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

function BucketRow({ bucket, layout, ordersById, selectedOrderId, selectedDeadline, onSelectOrder }) {
  const label = BUCKET_LABELS[bucket]
  const isPassive = bucket === BUCKETS.passive
  return (
    <>
      <div className="sticky left-0 z-10 bg-surface-dim border-b border-r border-border p-2 text-[11px] font-semibold uppercase text-text">
        {label}
      </div>
      {layout.map((slot) => {
        if (slot.type === 'gap') {
          return (
            <div
              key={`${bucket}-${slot.key}`}
              className="border-b border-border bg-surface-dim/60"
              aria-hidden
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.05) 4px, rgba(0,0,0,0.05) 6px)',
              }}
            />
          )
        }
        const d = slot.day
        const isDeadlineCol = d.date === selectedDeadline
        const isToday = d.date === TODAY_ISO
        if (isPassive) {
          const passives = d.passives || []
          return (
            <div
              key={`${bucket}-${d.date}`}
              className={`border-b border-border p-1 min-h-[44px] space-y-1
                ${isDeadlineCol ? 'bg-info/10 border-l-2 border-r-2 border-dashed border-info/40' : ''}
                ${isToday && !isDeadlineCol ? 'bg-accent/[0.03]' : ''}`}
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
        const slotData = d.buckets[bucket]
        if (!slotData) return (
          <div
            key={`${bucket}-${d.date}`}
            className={`border-b border-border p-1 min-h-[44px]
              ${isToday ? 'bg-accent/[0.03]' : ''}`}
          />
        )
        return (
          <DroppableCell
            key={`${bucket}-${d.date}`}
            bucket={bucket}
            date={d.date}
            slot={slotData}
            isDeadlineCol={isDeadlineCol}
            isToday={isToday}
            ordersById={ordersById}
            selectedOrderId={selectedOrderId}
            onSelectOrder={onSelectOrder}
          />
        )
      })}
    </>
  )
}

function DroppableCell({ bucket, date, slot, isDeadlineCol, isToday, ordersById, selectedOrderId, onSelectOrder }) {
  const { setNodeRef, isOver } = useDroppable({ id: makeDropId(bucket, date) })
  const pct = loadPct(slot.hours, slot.capacity)
  return (
    <div
      ref={setNodeRef}
      className={`relative border-b border-border p-1 min-h-[44px] space-y-1
        ${loadShade(slot.hours, slot.capacity, isOver, true)}
        ${slot.overload ? 'ring-1 ring-danger/40 ring-inset' : ''}
        ${isToday && !isDeadlineCol ? 'bg-accent/[0.03]' : ''}
        ${isDeadlineCol ? 'border-l-2 border-r-2 border-dashed border-info/40' : ''}
        ${isOver ? 'ring-2 ring-info ring-inset' : ''}`}
      title={slot.capacity ? `Загрузка: ${Math.round(slot.hours * 10) / 10} / ${slot.capacity} ч (${pct}%)` : ''}
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
        <div className="absolute bottom-0.5 right-1 flex items-center gap-1 text-[9px] font-mono text-text-muted pointer-events-none">
          <span>{loadText(slot.hours, slot.capacity)}</span>
          {pct > 0 && (
            <span className={`px-1 rounded font-bold ${
              pct > 100 ? 'bg-danger/20 text-danger'
                : pct > 85 ? 'bg-warning/20 text-warning'
                : 'bg-success/20 text-success'
            }`}>{pct}%</span>
          )}
        </div>
      )}
    </div>
  )
}
