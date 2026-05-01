import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { DndContext, DragOverlay, useDroppable, closestCorners, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useOrders, updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { DraggableCard, DragOverlayCard } from '../components/DraggableCard'
import { ProductionCalendar } from '../components/ProductionCalendar'
import { ORDER_STATUSES, IS_3D_TYPE, PRIORITIES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { playNotificationSound } from '@/shared/lib/sound'
import { supabase } from '@/shared/lib/supabase'
import Tabs from '@/shared/components/Tabs'

const COLS = ['new', 'design', 'print', 'post_processing', 'die_cutting', 'resin_pouring', 'assembly', 'packaging']
const PRODUCTION_STATUSES = new Set(COLS)

const COL_COLORS = {
  new: 'bg-blue-500',
  design: 'bg-purple-500',
  print: 'bg-orange-500',
  post_processing: 'bg-amber-500',
  die_cutting: 'bg-rose-500',
  resin_pouring: 'bg-cyan-500',
  assembly: 'bg-yellow-500',
  packaging: 'bg-teal-500',
}

function DroppableColumn({ status, orders, onUpdated, isActive, activeFromStatus }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const label = ORDER_STATUSES[status]?.label || status
  const canReceive = isActive && activeFromStatus !== status

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl transition-all duration-200 ease-out min-h-[200px]
        ${isOver
          ? 'bg-accent/[0.06] ring-2 ring-accent/30'
          : canReceive
            ? 'bg-surface-dim/30'
            : ''
        }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1 py-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${COL_COLORS[status]}`} />
          <h3 className="font-semibold text-sm">{label}</h3>
        </div>
        <span className={`text-[11px] font-medium min-w-[24px] text-center py-0.5 px-2 rounded-full transition-colors
          ${isOver ? 'bg-accent text-white' : 'text-text-muted bg-surface-dim'}`}
        >
          {orders.length}
        </span>
      </div>

      {/* Cards */}
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
}

export default function ProductionBoardPage() {
  const { profile } = useAuth()
  const [viewMode, setViewMode] = useState('board')
  const [showMine, setShowMine] = useState(false)
  const [sortBy, setSortBy] = useState('created')
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [pendingMove, setPendingMove] = useState(null) // optimistic: { orderId, targetStatus }
  const [todayDone, setTodayDone] = useState(0)

  const { orders: allFetchedOrders, refetch } = useOrders()

  useEffect(() => {
    async function fetchTodayDone() {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { count } = await supabase
        .from('order_status_history')
        .select('*', { count: 'exact', head: true })
        .eq('to_status', 'done')
        .gte('created_at', today.toISOString())
      setTodayDone(count || 0)
    }
    fetchTodayDone()
  }, [])

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  const keyboardSensor = useSensor(KeyboardSensor)
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor)

  const allOrders = useMemo(() => {
    const orders = allFetchedOrders.filter((o) => PRODUCTION_STATUSES.has(o.status))
    // Apply optimistic move
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
      if (pA !== pB) return pB - pA // urgent first
      // Keep existing sort order for same priority
      if (sortBy === 'deadline') {
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return new Date(a.deadline) - new Date(b.deadline)
      }
      return 0
    })
    return filtered
  }, [showMine, profile, search, sortBy])

  const columns = useMemo(() => ({
    new: filterAndSort(allOrders.filter((o) => o.status === 'new')),
    design: filterAndSort(allOrders.filter((o) => o.status === 'design')),
    print: filterAndSort(allOrders.filter((o) => o.status === 'print')),
    post_processing: filterAndSort(allOrders.filter((o) => o.status === 'post_processing')),
    die_cutting: filterAndSort(allOrders.filter((o) => o.status === 'die_cutting')),
    resin_pouring: filterAndSort(allOrders.filter((o) => o.status === 'resin_pouring')),
    assembly: filterAndSort(allOrders.filter((o) => o.status === 'assembly')),
    packaging: filterAndSort(allOrders.filter((o) => o.status === 'packaging')),
  }), [allOrders, filterAndSort])

  const activeOrder = activeId ? allFetchedOrders.find((o) => o.id === activeId) : null
  const total = allOrders.length

  // Sound notification when new orders appear
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

    // Optimistic: instantly move the card
    setPendingMove({ orderId, targetStatus })

    try {
      const fromIdx = COLS.indexOf(order.status)
      const toIdx = COLS.indexOf(targetStatus)

      if (toIdx > fromIdx) {
        let currentStatus = order.status
        for (let i = fromIdx; i < toIdx; i++) {
          const nextCol = COLS[i + 1]
          // Skip resin_pouring for non-3D orders
          if (nextCol === 'resin_pouring' && !IS_3D_TYPE(order.order_type)) continue

          const intermediateMap = { design: 'design_done', print: 'print_done' }
          const intermediate = intermediateMap[currentStatus]
          if (intermediate) {
            await updateOrderStatus(orderId, currentStatus, intermediate)
            currentStatus = intermediate
          }
          if (currentStatus !== nextCol) {
            await updateOrderStatus(orderId, currentStatus, nextCol)
            currentStatus = nextCol
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Производство</h1>
          <p className="text-text-muted text-sm">
            {total} {total === 1 ? 'заказ' : total < 5 ? 'заказа' : 'заказов'} · перетаскивайте между колонками · Выполнено сегодня: {todayDone}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            className="rounded-lg border border-border px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50 w-36"
          />
          <button
            onClick={() => setShowMine(!showMine)}
            aria-pressed={showMine}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
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
            className="rounded-lg border border-border px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="created">По дате</option>
            <option value="deadline">По дедлайну</option>
          </select>
        </div>
      </div>

      {viewMode === 'board' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(e) => setActiveId(e.active.id)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-8 gap-4">
            {COLS.map((status) => (
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

          <DragOverlay dropAnimation={dropAnimation}>
            {activeOrder && <DragOverlayCard order={activeOrder} />}
          </DragOverlay>
        </DndContext>
      ) : (
        <ProductionCalendar />
      )}
    </div>
  )
}
