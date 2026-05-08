import { useEffect, memo } from 'react'
import { DndContext, DragOverlay, useDroppable, closestCorners, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { DraggableCard, DragOverlayCard } from '@/features/production/components/DraggableCard'
import { useProductionBoard } from '@/features/production/hooks/useProductionBoard'
import { ORDER_STATUSES, isStageAllowed } from '@/shared/constants'
import { stageBorderClass, stageDotClass, DEPT_GROUPS } from '@/shared/lib/department-mapping'
import MultiSelect from '@/shared/components/MultiSelect'
import ErrorState from '@/shared/components/ErrorState'

// Все 11 рабочих колонок (без cancelled). 'done' добавится через includeArchived.
const COLS = ['new', 'design', 'prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'pouring', 'assembly_3d', 'packaging', 'otk']

const DEPT_OPTIONS = Object.entries(DEPT_GROUPS).map(([key, g]) => ({ value: key, label: g.label }))

const DroppableColumn = memo(function DroppableColumn({ status, orders, isActive, activeOrder, includeArchived }) {
  const allowed = activeOrder ? isStageAllowed(activeOrder, status) : true
  const isSameAsCurrent = activeOrder?.status === status
  // Колонка disabled для активного заказа, если этап не входит в его маршрут
  // или совпадает с текущим. dnd-kit не вернёт `over` для такой колонки.
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: isActive && (!allowed || isSameAsCurrent) })
  const label = ORDER_STATUSES[status]?.label || status
  const dotCls = stageDotClass(status)
  const borderCls = stageBorderClass(status)
  const isBlocked = isActive && !allowed

  return (
    <div
      ref={setNodeRef}
      data-col={status}
      role="region"
      aria-label={label}
      className={`flex flex-col rounded-2xl border ${borderCls} bg-surface min-h-[200px] w-[78vw] sm:w-[260px] shrink-0 transition-all
        ${isOver ? 'ring-2 ring-accent/40 shadow-lg' : 'shadow-card'}
        ${isBlocked ? 'opacity-40 grayscale pointer-events-none' : ''}
      `}
    >
      {/* Цветная полоска отдела сверху */}
      <div className={`h-1.5 rounded-t-2xl ${dotCls.replace('bg-', 'bg-')}`} aria-hidden="true" />
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotCls}`} aria-hidden="true" />
          {label}
        </h3>
        <span className={`text-xs font-medium min-w-[24px] text-center py-0.5 px-2 rounded-full transition-colors
          ${isOver ? 'bg-accent text-on-accent' : 'text-text-muted bg-surface-2'}`}>
          {orders.length}
        </span>
      </div>

      <SortableContext items={orders.map((o) => o.id)} strategy={verticalListSortingStrategy}>
        <div className="px-2 pb-2 space-y-2 flex-1 overflow-y-auto max-h-[60vh]">
          {orders.length === 0 ? (
            <div className={`border border-dashed rounded-xl py-8 text-center transition-all
              ${isOver ? 'border-accent/30 bg-accent/[0.03]' : 'border-border/50'}`}>
              <p className={`text-xs ${isOver ? 'text-accent' : 'text-text-muted/60'}`}>
                {isOver ? 'Отпустите здесь' : (includeArchived && status === 'done' ? '—' : 'Нет заказов')}
              </p>
            </div>
          ) : (
            orders.map((order) => <DraggableCard key={order.id} order={order} />)
          )}
        </div>
      </SortableContext>
    </div>
  )
})

/**
 * Канбан с DnD, цветными полосами по отделам, мульти-фильтром по отделам
 * и опциональным показом завершённых.
 */
export function OrdersKanban({ deptFilter, onDeptFilterChange, includeArchived }) {
  const board = useProductionBoard({ includeArchived })
  const { columns, scrollRef, scrollState, setScrollState, error, refetch, activeId, setActiveId, activeOrder, handleDragEnd, loading } = board

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
    return () => { el.removeEventListener('scroll', onScroll); if (rafId) cancelAnimationFrame(rafId) }
  }, [scrollRef, setScrollState])

  if (error) return <ErrorState error={error} onRetry={refetch} />

  // Фильтр по отделу: показываем только релевантные колонки
  const visibleCols = (() => {
    let cols = [...COLS]
    if (includeArchived) cols.push('done')
    if (deptFilter && deptFilter.length > 0) {
      const allowedStages = new Set()
      deptFilter.forEach((key) => {
        DEPT_GROUPS[key]?.stages.forEach((s) => allowedStages.add(s))
      })
      cols = cols.filter((s) => allowedStages.has(s) || (s === 'new' && deptFilter.includes('design')))
    }
    return cols
  })()

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <MultiSelect
          label="Отдел"
          options={DEPT_OPTIONS}
          value={deptFilter || []}
          onChange={onDeptFilterChange}
          allLabel="Все отделы"
        />
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden pb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="shrink-0 bg-surface rounded-2xl border border-border p-4 w-[78vw] sm:w-[260px]">
              <div className="h-3 bg-surface-dim rounded w-24 mb-3 animate-pulse" />
              <div className="bg-surface-dim rounded-xl h-24 mb-2 animate-pulse" />
              <div className="bg-surface-dim rounded-xl h-24 mb-2 animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <DndContext
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
              {visibleCols.map((status) => (
                <div key={status} className="snap-start">
                  <DroppableColumn
                    status={status}
                    orders={columns[status] || []}
                    isActive={!!activeId}
                    activeOrder={activeOrder}
                    includeArchived={includeArchived}
                  />
                </div>
              ))}
            </div>
          </div>

          <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
            {activeOrder && <DragOverlayCard order={activeOrder} />}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
