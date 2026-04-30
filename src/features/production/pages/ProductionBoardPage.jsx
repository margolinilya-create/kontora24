import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { DndContext, DragOverlay, useDroppable, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useOrders, updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { DraggableCard } from '../components/DraggableCard'
import { ORDER_STATUSES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'

const COLS = ['design', 'print', 'assembly']

function DroppableColumn({ status, orders, onUpdated }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const label = ORDER_STATUSES[status]?.label || status

  return (
    <div ref={setNodeRef} className={`transition-colors rounded-xl ${isOver ? 'bg-accent/5 ring-2 ring-accent/20' : ''}`}>
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${ORDER_STATUSES[status]?.color?.split(' ')[0] || 'bg-gray-300'}`} />
          {label}
        </h3>
        <span className="text-xs text-text-muted bg-surface-dim px-2 py-0.5 rounded-full">{orders.length}</span>
      </div>

      <SortableContext items={orders.map((o) => o.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3 min-h-[120px]">
          {orders.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg p-8 text-center">
              <p className="text-xs text-text-muted">Перетащите сюда</p>
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
  const [showMine, setShowMine] = useState(false)
  const [sortBy, setSortBy] = useState('created')
  const [activeId, setActiveId] = useState(null)

  const { orders: designOrders, refetch: r1 } = useOrders({ status: 'design' })
  const { orders: printOrders, refetch: r2 } = useOrders({ status: 'print' })
  const { orders: assemblyOrders, refetch: r3 } = useOrders({ status: 'assembly' })
  const refetchAll = useCallback(() => { r1(); r2(); r3() }, [r1, r2, r3])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function filterAndSort(orders) {
    let filtered = showMine && profile ? orders.filter((o) => o.assigned_to === profile.id) : orders
    if (sortBy === 'deadline') {
      filtered = [...filtered].sort((a, b) => {
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return new Date(a.deadline) - new Date(b.deadline)
      })
    }
    return filtered
  }

  const allOrders = [...designOrders, ...printOrders, ...assemblyOrders]
  const activeOrder = activeId ? allOrders.find((o) => o.id === activeId) : null

  const columns = {
    design: filterAndSort(designOrders),
    print: filterAndSort(printOrders),
    assembly: filterAndSort(assemblyOrders),
  }

  const total = designOrders.length + printOrders.length + assemblyOrders.length

  // Allowed transitions for drag (based on workflow)
  const ALLOWED_DROP = { design: ['print'], print: ['assembly'], assembly: [] }

  async function handleDragEnd(event) {
    setActiveId(null)
    const { active, over } = event
    if (!over || !active) return

    const orderId = active.id
    const order = allOrders.find((o) => o.id === orderId)
    if (!order) return

    const targetStatus = COLS.includes(over.id) ? over.id : over.data?.current?.status
    if (!targetStatus || targetStatus === order.status) return

    // Check if transition is allowed
    const allowed = ALLOWED_DROP[order.status]
    if (!allowed?.includes(targetStatus)) {
      toast.error(`Нельзя перенести из "${ORDER_STATUSES[order.status]?.label}" в "${ORDER_STATUSES[targetStatus]?.label}"`)
      return
    }

    try {
      // Map drag target to actual next status (design→design_done→print etc)
      const statusMap = { design: 'design_done', print: 'print_done', assembly: 'done' }
      const intermediateStatus = statusMap[order.status]

      if (intermediateStatus && intermediateStatus !== targetStatus) {
        // Two-step: design → design_done, then design_done → print
        await updateOrderStatus(orderId, order.status, intermediateStatus)
        await updateOrderStatus(orderId, intermediateStatus, targetStatus)
      } else {
        await updateOrderStatus(orderId, order.status, targetStatus)
      }

      toast.success(`Заказ #${order.number} → ${ORDER_STATUSES[targetStatus]?.label}`)
      refetchAll()
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Производство</h1>
          <p className="text-text-muted">{total} заказов · перетаскивайте между колонками</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMine(!showMine)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${showMine ? 'bg-accent text-white' : 'bg-surface border border-border text-text-muted hover:bg-surface-dim'}`}
          >
            {showMine ? 'Мои' : 'Все'}
          </button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="created">По дате</option>
            <option value="deadline">По дедлайну</option>
          </select>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e) => setActiveId(e.active.id)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {COLS.map((status) => (
            <DroppableColumn
              key={status}
              status={status}
              orders={columns[status]}
              onUpdated={refetchAll}
            />
          ))}
        </div>

        <DragOverlay>
          {activeOrder && (
            <div className="bg-surface rounded-xl border-2 border-accent shadow-xl p-4 w-72 opacity-90">
              <p className="font-semibold text-accent">#{activeOrder.number}</p>
              <p className="text-sm text-text-muted">{activeOrder.qty} шт</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
