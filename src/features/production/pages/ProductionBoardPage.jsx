import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react'
import { DndContext, DragOverlay, useDroppable, closestCorners, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useOrders, updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { DraggableCard, DragOverlayCard } from '../components/DraggableCard'
import { ProductionCalendar } from '../components/ProductionCalendar'
import { PipelineSummary, COLS, COL_COLORS } from '../components/PipelineSummary'
import { ORDER_STATUSES, IS_3D_TYPE, PRIORITIES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { playNotificationSound } from '@/shared/lib/sound'
import { supabase } from '@/shared/lib/supabase'
import Tabs from '@/shared/components/Tabs'
import { OnboardingTip } from '@/shared/components/OnboardingTip'

const PRODUCTION_STATUSES = new Set(COLS)

const PHASES = [
  { key: 'prep', label: 'Подготовка', cols: ['new', 'design'] },
  { key: 'prod', label: 'Производство', cols: ['print', 'post_processing'] },
  { key: 'finish', label: 'Финиш', cols: ['resin_pouring', 'assembly', 'packaging', 'otk'] },
]

// --- Droppable column ---
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
          <span className={`w-2 h-2 rounded-full ${COL_COLORS[status]}`} />
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
  const { profile } = useAuth()
  const [viewMode, setViewMode] = useState('board')
  const [showMine, setShowMine] = useState(false)
  const [sortBy, setSortBy] = useState('created')
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [pendingMove, setPendingMove] = useState(null)
  const [todayDone, setTodayDone] = useState(0)
  const scrollRef = useRef(null)

  const { orders: allFetchedOrders, loading, refetch } = useOrders()

  useEffect(() => {
    async function fetchTodayDone() {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { count } = await supabase
        .from('k24_order_status_history')
        .select('*', { count: 'exact', head: true })
        .eq('to_status', 'done')
        .gte('created_at', today.toISOString())
      setTodayDone(count || 0)
    }
    fetchTodayDone()
  }, [])

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  const keyboardSensor = useSensor(KeyboardSensor)
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor)

  // Track scroll position for fade indicators
  const [scrollState, setScrollState] = useState({ start: true, end: false })
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      setScrollState({
        start: el.scrollLeft < 10,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 10,
      })
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [viewMode])

  // Auto-scroll to worker's relevant column on mount (mobile only)
  useEffect(() => {
    if (!profile || !scrollRef.current || window.innerWidth > 640) return
    const roleColMap = { designer: 'design', printer: 'print', resin_pourer: 'resin_pouring', assembler: 'assembly' }
    const targetCol = roleColMap[profile.role]
    if (!targetCol) return
    const colEl = scrollRef.current.querySelector(`[data-col="${targetCol}"]`)
    if (colEl) {
      setTimeout(() => colEl.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }), 300)
    }
  }, [profile, viewMode])

  const allOrders = useMemo(() => {
    const orders = allFetchedOrders.filter((o) => PRODUCTION_STATUSES.has(o.status))
    if (pendingMove) {
      return orders.map((o) =>
        o.id === pendingMove.orderId ? { ...o, status: pendingMove.targetStatus } : o
      )
    }
    return orders
  }, [allFetchedOrders, pendingMove])

  const filterAndSort = useCallback((orders) => {
    let filtered = showMine && profile ? orders.filter((o) => o.assigned_to === profile.id) : orders
    if (search) {
      const s = search.toLowerCase()
      filtered = filtered.filter((o) => String(o.number).includes(s))
    }
    filtered = [...filtered].sort((a, b) => {
      const pA = PRIORITIES[a.priority]?.sortOrder ?? 1
      const pB = PRIORITIES[b.priority]?.sortOrder ?? 1
      if (pA !== pB) return pB - pA
      if (sortBy === 'deadline') {
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return new Date(a.deadline) - new Date(b.deadline)
      }
      return 0
    })
    return filtered
  }, [showMine, profile, search, sortBy])

  const columns = useMemo(() => {
    const result = {}
    for (const s of COLS) {
      result[s] = filterAndSort(allOrders.filter((o) => o.status === s))
    }
    return result
  }, [allOrders, filterAndSort])

  const activeOrder = activeId ? allFetchedOrders.find((o) => o.id === activeId) : null
  const total = allOrders.length

  const prevCountRef = useRef(total)
  useEffect(() => {
    if (total > prevCountRef.current) {
      playNotificationSound()
    }
    prevCountRef.current = total
  }, [total])

  async function handleDragEnd(event) {
    setActiveId(null)
    const { active, over } = event
    if (!over || !active) return

    const orderId = active.id
    const order = allFetchedOrders.find((o) => o.id === orderId)
    if (!order) return

    const targetStatus = COLS.includes(over.id) ? over.id : over.data?.current?.status
    if (!targetStatus || targetStatus === order.status) return

    setPendingMove({ orderId, targetStatus })

    try {
      const fromIdx = COLS.indexOf(order.status)
      const toIdx = COLS.indexOf(targetStatus)

      if (toIdx > fromIdx) {
        let currentStatus = order.status
        for (let i = fromIdx; i < toIdx; i++) {
          const nextCol = COLS[i + 1]
          if (nextCol === 'resin_pouring' && !IS_3D_TYPE(order.order_type)) continue

          const intermediateMap = { design: 'design_done', print: 'print_done' }
          const intermediate = intermediateMap[currentStatus]
          try {
            if (intermediate) {
              await updateOrderStatus(orderId, currentStatus, intermediate)
              currentStatus = intermediate
            }
            if (currentStatus !== nextCol) {
              await updateOrderStatus(orderId, currentStatus, nextCol)
              currentStatus = nextCol
            }
          } catch (stepErr) {
            toast.error(`Заказ #${order.number} остановлен на "${ORDER_STATUSES[currentStatus]?.label || currentStatus}": ${stepErr.message}`)
            return
          }
        }
      } else {
        await updateOrderStatus(orderId, order.status, targetStatus)
      }

      toast.success(`Заказ #${order.number} → ${ORDER_STATUSES[targetStatus]?.label}`)
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setPendingMove(null)
      refetch()
    }
  }

  const dropAnimation = {
    duration: 250,
    easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative">
          <h1 className="text-2xl font-bold">Производство</h1>
          <p className="text-text-muted text-sm">
            {total} {total === 1 ? 'заказ' : total < 5 ? 'заказа' : 'заказов'} · Выполнено сегодня: {todayDone}
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
                ? 'bg-accent text-white shadow-sm shadow-accent/25'
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
          {/* Pipeline summary strip */}
          <PipelineSummary columns={columns} scrollRef={scrollRef} />

          {/* Skeleton while loading */}
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

          {/* Kanban board — horizontal scroll with phase groups */}
          {!loading && <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e) => setActiveId(e.active.id)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="relative">
              {/* Scroll fade indicators */}
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
                const phaseCols = phase.cols.filter(
                  (s) => s !== 'resin_pouring' || columns.resin_pouring.length > 0
                )
                if (phaseCols.length === 0) return null

                const phaseCount = phaseCols.reduce((sum, s) => sum + (columns[s]?.length || 0), 0)

                return (
                  <div key={phase.key} className="shrink-0 bg-surface rounded-2xl border border-border p-4 snap-start">
                    {/* Phase header */}
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border">
                      <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                        {phase.label}
                      </span>
                      <span className="text-xs text-text-muted/50 font-medium">
                        {phaseCount}
                      </span>
                    </div>

                    {/* Columns in this phase */}
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
