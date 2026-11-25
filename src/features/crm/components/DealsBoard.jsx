import { memo, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, useDroppable, useDraggable, closestCorners,
  PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { formatPrice, formatDate } from '@/shared/lib/utils'
import { groupDealsByStage, stageTotals, isRotting, isOverdue, daysInStage } from '../lib/deals'
import { contactFullName } from '../lib/client-metrics'

function DealCardBody({ deal, stage, now }) {
  const rotting = isRotting(deal, stage, now)
  const overdue = isOverdue(deal, stage, now)
  let hint = deal.expected_close ? formatDate(deal.expected_close) : ''
  if (rotting) hint = `${daysInStage(deal, now)} дн. на этапе`
  if (overdue) hint = `срок ${formatDate(deal.expected_close)}`
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm leading-snug break-words">{deal.title}</span>
        <span className="text-[11px] text-text-muted shrink-0">№ {deal.number}</span>
      </div>
      {(deal.client || deal.contact) && (
        <div className="text-xs text-text-muted mt-0.5 truncate">
          {deal.client?.name}{deal.client && deal.contact ? ' · ' : ''}{deal.contact ? contactFullName(deal.contact) : ''}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-1.5 text-xs">
        <span className="font-semibold">{deal.amount != null ? formatPrice(deal.amount) : '—'}</span>
        <span className={overdue ? 'text-danger font-medium' : rotting ? 'text-warning font-medium' : 'text-text-muted'}>{hint}</span>
      </div>
    </>
  )
}

const DealCard = memo(function DealCard({ deal, stage, now }) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, data: { deal } })
  const rotting = isRotting(deal, stage, now)
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => navigate(`/crm/deals/${deal.id}`)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        if (e.key === 'Enter') navigate(`/crm/deals/${deal.id}`)
      }}
      className={`bg-surface rounded-xl border px-3 py-2.5 cursor-pointer select-none touch-manipulation hover:shadow-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        rotting ? 'border-warning/60' : 'border-border'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <DealCardBody deal={deal} stage={stage} now={now} />
    </div>
  )
})

function StageColumn({ stage, deals, now }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const totals = stageTotals(deals)
  return (
    <div className="w-[272px] shrink-0 flex flex-col max-h-[calc(100vh-220px)]">
      <div className="flex items-center gap-2 px-1 pb-1">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} aria-hidden="true" />
        <span className="font-medium text-sm truncate">{stage.name}</span>
        <span className="text-xs text-text-muted ml-auto">{totals.count}</span>
      </div>
      <div className="text-xs text-text-muted px-1 pb-2">{formatPrice(totals.sum)}</div>
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto rounded-xl p-1.5 space-y-2 min-h-[120px] transition-colors ${
          isOver ? 'bg-accent/10 ring-2 ring-accent/40' : 'bg-surface-2'
        }`}
      >
        {deals.map((d) => <DealCard key={d.id} deal={d} stage={stage} now={now} />)}
        {deals.length === 0 && <p className="text-xs text-text-muted text-center py-4">Пусто</p>}
      </div>
    </div>
  )
}

/**
 * R28.1 — канбан сделок по этапам воронки (DnD как в OrdersKanban).
 * onMove(deal, toStage) — родитель решает: причина проигрыша, запрос, откат.
 */
export function DealsBoard({ deals, stages, onMove }) {
  const [activeDeal, setActiveDeal] = useState(null)
  const now = useMemo(() => new Date(), [])
  const grouped = useMemo(() => groupDealsByStage(deals, stages), [deals, stages])
  const stagesById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  function handleDragEnd({ active, over }) {
    setActiveDeal(null)
    if (!over) return
    const deal = active.data.current?.deal
    const toStage = stagesById[over.id]
    if (!deal || !toStage || deal.stage_id === toStage.id) return
    onMove(deal, toStage)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }) => setActiveDeal(active.data.current?.deal || null)}
      onDragCancel={() => setActiveDeal(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {stages.map((s) => <StageColumn key={s.id} stage={s} deals={grouped[s.id] || []} now={now} />)}
        </div>
      </div>
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
        {activeDeal && (
          <div className="bg-surface rounded-xl border border-accent px-3 py-2.5 shadow-lg w-[260px]">
            <DealCardBody deal={activeDeal} stage={stagesById[activeDeal.stage_id]} now={now} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
