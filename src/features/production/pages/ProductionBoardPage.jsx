import { useState, useEffect, useRef, memo } from 'react'
import { DndContext, DragOverlay, useDroppable, closestCorners, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useVirtualizer } from '@tanstack/react-virtual'
import { DraggableCard, DragOverlayCard } from '../components/DraggableCard'
import { ProductionCalendar } from '../components/ProductionCalendar'
import { PipelineSummary } from '../components/PipelineSummary'
import { useProductionBoard } from '../hooks/useProductionBoard'
import { ORDER_STATUSES } from '@/shared/constants'
import { stageDotClass } from '@/shared/lib/department-mapping'
import Tabs from '@/shared/components/Tabs'
import { OnboardingTip } from '@/shared/components/OnboardingTip'
import ErrorState from '@/shared/components/ErrorState'

const PHASES = [
  { key: 'prep', label: 'Подготовка', cols: ['new', 'design', 'prepress'] },
  { key: 'prod', label: 'Производство', cols: ['print', 'lamination', 'cutting'] },
  { key: '3d', label: '3D', cols: ['selection_pouring', 'pouring', 'assembly_3d'] },
  { key: 'finish', label: 'Финиш', cols: ['packaging', 'otk'] },
]

const VIRTUAL_THRESHOLD = 15
const ESTIMATED_CARD_HEIGHT = 148

function VirtualizedCardList({ orders, onUpdated }) {
  const parentRef = useRef(null)
  const virtualizer = useVirtualizer({
    count: orders.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    gap: 8,
    overscan: 3,
  })

  return (
    <div ref={parentRef} className="overflow-y-auto max-h-[60vh] px-0.5 scrollbar-thin">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const order = orders[virtualItem.index]
          return (
            <div
              key={order.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <DraggableCard order={order} onUpdated={onUpdated} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const DroppableColumn = memo(function DroppableColumn({ status, orders, onUpdated, isActive, activeFromStatus }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const label = ORDER_STATUSES[status]?.label || status
  const canReceive = isActive && activeFromStatus !== status
  const useVirtual = orders.length > VIRTUAL_THRESHOLD

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
          <span className={`w-2 h-2 rounded-full ${stageDotClass(status)}`} aria-hidden="true" />
          <h3 className="font-semibold text-sm">{label}</h3>
        </div>
        <span className={`text-xs font-medium min-w-[24px] text-center py-0.5 px-2 rounded-full transition-colors
          ${isOver ? 'bg-accent text-on-accent' : 'text-text-muted bg-surface-2'}`}
        >
          {orders.length}
        </span>
      </div>

      <SortableContext items={orders.map((o) => o.id)} strategy={verticalListSortingStrategy}>
        {orders.length === 0 ? (
          <div className="px-0.5">
            <div className={`border border-dashed rounded-xl py-10 text-center transition-all duration-200
              ${isOver ? 'border-accent/30 bg-accent/[0.03]' : 'border-border/60'}`}
            >
              <p className={`text-xs ${isOver ? 'text-accent' : 'text-text-muted/60'}`}>
                {isOver ? 'Отпустите здесь' : 'Нет заказов'}
              </p>
            </div>
          </div>
        ) : useVirtual ? (
          <VirtualizedCardList orders={orders} onUpdated={onUpdated} />
        ) : (
          <div className="space-y-2 px-0.5">
            {orders.map((order) => (
              <DraggableCard key={order.id} order={order} onUpdated={onUpdated} />
            ))}
          </div>
        )}
      </SortableContext>
    </div>
  )
})

export default function ProductionBoardPage() {
  const [viewMode, setViewMode] = useState('board')
  const board = useProductionBoard()
  // Destructure board members so the React Compiler lint rule doesn't conflate
  // non-ref properties with the scrollRef ref it's wrapped together with.
  const {
    scrollRef, scrollState, setScrollState,
    profile, search, setSearch, showMine, setShowMine, sortBy, setSortBy,
    columns, total, todayDone, loading, error, refetch,
    activeId, setActiveId, activeOrder, handleDragEnd,
  } = board

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  const keyboardSensor = useSensor(KeyboardSensor)
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor)

  // Scroll fade indicators
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let rafId = null
    function onScroll() {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        setScrollState({
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
  }, [viewMode, scrollRef, setScrollState])

  // Auto-scroll to worker's relevant column on mount (mobile only)
  useEffect(() => {
    if (!profile || !scrollRef.current || window.innerWidth > 640) return
    const roleColMap = { designer: 'design', printer: 'print', post_printer: 'selection_pouring' }
    const targetCol = roleColMap[profile.role]
    if (!targetCol) return
    const colEl = scrollRef.current.querySelector(`[data-col="${targetCol}"]`)
    if (colEl) {
      setTimeout(() => colEl.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }), 300)
    }
  }, [profile, viewMode, scrollRef])

  const dropAnimation = { duration: 250, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative">
          <h1 className="text-2xl font-bold">Производство</h1>
          <p className="text-text-muted text-sm">
            {total} {total === 1 ? 'заказ' : total < 5 ? 'заказа' : 'заказов'} · Выполнено сегодня: {todayDone ?? '—'}
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по №..."
            aria-label="Поиск по номеру заказа"
            className="rounded-lg border border-border px-3 py-2.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50 w-full sm:w-36 min-h-[44px]"
          />
          <button
            onClick={() => setShowMine(!showMine)}
            aria-pressed={showMine}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] ${
              showMine
                ? 'bg-accent text-on-accent shadow-sm shadow-accent/25'
                : 'bg-surface border border-border text-text-muted hover:bg-surface-dim'
            }`}
          >
            {showMine ? 'Мои' : 'Все'}
          </button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
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
          <PipelineSummary columns={columns} scrollRef={scrollRef} />

          {loading && (
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

          {!loading && error && (
            <ErrorState error={error} onRetry={refetch} />
          )}

          {!loading && !error && <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e) => setActiveId(e.active.id)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="relative">
              {!scrollState.start && (
                <div className="absolute left-0 top-0 bottom-4 w-8 bg-gradient-to-r from-surface-dim to-transparent z-10 pointer-events-none sm:hidden" />
              )}
              {!scrollState.end && (
                <div className="absolute right-0 top-0 bottom-4 w-8 bg-gradient-to-l from-surface-dim to-transparent z-10 pointer-events-none sm:hidden" />
              )}
            <div
              ref={scrollRef}
              className="flex gap-3 overflow-x-auto pb-4 kanban-scroll scroll-smooth snap-x snap-mandatory sm:snap-none"
            >
              {PHASES.map((phase) => {
                const phaseCols = phase.key === '3d'
                  ? phase.cols.filter((s) => (columns[s]?.length || 0) > 0)
                  : phase.cols
                if (phaseCols.length === 0) return null

                const phaseCount = phaseCols.reduce((sum, s) => sum + (columns[s]?.length || 0), 0)

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
                          orders={columns[status]}
                          onUpdated={refetch}
                          isActive={!!activeId}
                          activeFromStatus={activeOrder?.status}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            </div>

            <DragOverlay dropAnimation={dropAnimation}>
              {activeOrder && <DragOverlayCard order={activeOrder} />}
            </DragOverlay>
          </DndContext>}
        </>
      ) : (
        <ProductionCalendar />
      )}
    </div>
  )
}
