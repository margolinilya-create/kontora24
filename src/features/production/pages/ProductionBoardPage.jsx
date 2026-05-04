import { useState, useEffect, memo } from 'react'
import { DndContext, DragOverlay, useDroppable, closestCorners, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { DraggableCard, DragOverlayCard } from '../components/DraggableCard'
import { ProductionCalendar } from '../components/ProductionCalendar'
import { PipelineSummary, COL_COLORS } from '../components/PipelineSummary'
import { useProductionBoard } from '../hooks/useProductionBoard'
import { ORDER_STATUSES } from '@/shared/constants'
import Tabs from '@/shared/components/Tabs'
import { OnboardingTip } from '@/shared/components/OnboardingTip'

const PHASES = [
  { key: 'prep', label: 'Подготовка', cols: ['new', 'design', 'prepress'] },
  { key: 'prod', label: 'Производство', cols: ['print', 'lamination', 'cutting'] },
  { key: '3d', label: '3D', cols: ['selection_pouring', 'pouring', 'assembly_3d'] },
  { key: 'finish', label: 'Финиш', cols: ['packaging', 'otk'] },
]

const DroppableColumn = memo(function DroppableColumn({ status, orders, onUpdated, isActive, activeFromStatus }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const label = ORDER_STATUSES[status]?.label || status
  const canReceive = isActive && activeFromStatus !== status

  return (
    <div
      ref={setNodeRef}
      data-col={status}
      role="region"
      aria-label={label}
      className={`rounded-xl transition-all duration-200 ease-out min-h-[200px]
        w-[70vw] sm:w-[260px] shrink-0
        ${isOver
          ? 'bg-accent/[0.06] ring-2 ring-accent/30'
          : canReceive
            ? 'bg-surface-dim/30'
            : ''
        }`}
    >
      <div className="flex items-center justify-between mb-3 px-1 py-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${COL_COLORS[status]}`} aria-hidden="true" />
          <h3 className="font-semibold text-sm">{label}</h3>
        </div>
        <span className={`text-xs font-medium min-w-[24px] text-center py-0.5 px-2 rounded-full transition-colors
          ${isOver ? 'bg-accent text-white' : 'text-text-muted bg-surface-dim'}`}
        >
          {orders.length}
        </span>
      </div>

      <SortableContext items={orders.map((o) => o.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 px-0.5">
          {orders.length === 0 ? (
            <div className={`border border-dashed rounded-xl py-10 text-center transition-all duration-200
              ${isOver ? 'border-accent/30 bg-accent/[0.03]' : 'border-border/60'}`}
            >
              <p className={`text-xs ${isOver ? 'text-accent' : 'text-text-muted/60'}`}>
                {isOver ? 'Отпустите здесь' : 'Нет заказов'}
              </p>
            </div>
          ) : (
            orders.map((order) => (
              <DraggableCard key={order.id} order={order} onUpdated={onUpdated} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
})

export default function ProductionBoardPage() {
  const [viewMode, setViewMode] = useState('board')
  const board = useProductionBoard()

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  const keyboardSensor = useSensor(KeyboardSensor)
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor)

  // Scroll fade indicators
  useEffect(() => {
    const el = board.scrollRef.current
    if (!el) return
    let rafId = null
    function onScroll() {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        board.setScrollState({
          start: el.scrollLeft < 10,
          end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 10,
        })
      })
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to worker's relevant column on mount (mobile only)
  useEffect(() => {
    if (!board.profile || !board.scrollRef.current || window.innerWidth > 640) return
    const roleColMap = { designer: 'design', printer: 'print', post_printer: 'selection_pouring' }
    const targetCol = roleColMap[board.profile.role]
    if (!targetCol) return
    const colEl = board.scrollRef.current.querySelector(`[data-col="${targetCol}"]`)
    if (colEl) {
      setTimeout(() => colEl.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }), 300)
    }
  }, [board.profile, viewMode])

  const dropAnimation = { duration: 250, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative">
          <h1 className="text-2xl font-bold">Производство</h1>
          <p className="text-text-muted text-sm">
            {board.total} {board.total === 1 ? 'заказ' : board.total < 5 ? 'заказа' : 'заказов'} · Выполнено сегодня: {board.todayDone}
          </p>
          <OnboardingTip id="production-board-intro">
            Перетаскивайте карточки между колонками для смены статуса. Используйте фильтр «Мои» чтобы видеть только свои заказы.
          </OnboardingTip>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs
            items={[{ key: 'board', label: 'Доска' }, { key: 'calendar', label: 'Календарь' }]}
            active={viewMode}
            onChange={setViewMode}
          />
          <input
            type="text"
            value={board.search}
            onChange={(e) => board.setSearch(e.target.value)}
            placeholder="Поиск по №..."
            aria-label="Поиск по номеру заказа"
            className="rounded-lg border border-border px-3 py-2.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50 w-full sm:w-36 min-h-[44px]"
          />
          <button
            onClick={() => board.setShowMine(!board.showMine)}
            aria-pressed={board.showMine}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] ${
              board.showMine
                ? 'bg-accent text-white shadow-sm shadow-accent/25'
                : 'bg-surface border border-border text-text-muted hover:bg-surface-dim'
            }`}
          >
            {board.showMine ? 'Мои' : 'Все'}
          </button>
          <select
            value={board.sortBy}
            onChange={(e) => board.setSortBy(e.target.value)}
            aria-label="Сортировка"
            className="rounded-lg border border-border px-3 py-2.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px]"
          >
            <option value="created">По дате</option>
            <option value="deadline">По дедлайну</option>
          </select>
        </div>
      </div>

      {viewMode === 'board' ? (
        <>
          <PipelineSummary columns={board.columns} scrollRef={board.scrollRef} />

          {board.loading && (
            <div className="flex gap-3 overflow-hidden pb-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="shrink-0 bg-surface rounded-2xl border border-border p-4 w-[70vw] sm:w-[260px]">
                  <div className="h-4 bg-surface-dim rounded w-24 mb-4 animate-pulse" />
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="bg-surface-dim rounded-xl h-28 mb-2 animate-pulse" />
                  ))}
                </div>
              ))}
            </div>
          )}

          {!board.loading && <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e) => board.setActiveId(e.active.id)}
            onDragEnd={board.handleDragEnd}
            onDragCancel={() => board.setActiveId(null)}
          >
            <div className="relative">
              {!board.scrollState.start && (
                <div className="absolute left-0 top-0 bottom-4 w-8 bg-gradient-to-r from-surface-dim to-transparent z-10 pointer-events-none sm:hidden" />
              )}
              {!board.scrollState.end && (
                <div className="absolute right-0 top-0 bottom-4 w-8 bg-gradient-to-l from-surface-dim to-transparent z-10 pointer-events-none sm:hidden" />
              )}
            <div
              ref={board.scrollRef}
              className="flex gap-3 overflow-x-auto pb-4 kanban-scroll scroll-smooth snap-x snap-mandatory sm:snap-none"
            >
              {PHASES.map((phase) => {
                const phaseCols = phase.key === '3d'
                  ? phase.cols.filter((s) => (board.columns[s]?.length || 0) > 0)
                  : phase.cols
                if (phaseCols.length === 0) return null

                const phaseCount = phaseCols.reduce((sum, s) => sum + (board.columns[s]?.length || 0), 0)

                return (
                  <div key={phase.key} className="shrink-0 bg-surface rounded-2xl border border-border p-4 snap-start">
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
                      <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                        {phase.label}
                      </span>
                      <span className="text-xs text-text-muted/50 font-medium">
                        {phaseCount}
                      </span>
                    </div>

                    <div className="flex gap-4">
                      {phaseCols.map((status) => (
                        <DroppableColumn
                          key={status}
                          status={status}
                          orders={board.columns[status]}
                          onUpdated={board.refetch}
                          isActive={!!board.activeId}
                          activeFromStatus={board.activeOrder?.status}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            </div>

            <DragOverlay dropAnimation={dropAnimation}>
              {board.activeOrder && <DragOverlayCard order={board.activeOrder} />}
            </DragOverlay>
          </DndContext>}
        </>
      ) : (
        <ProductionCalendar />
      )}
    </div>
  )
}
