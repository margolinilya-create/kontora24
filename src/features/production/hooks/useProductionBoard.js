import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useOrders, updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { COLS } from '../components/PipelineSummary'
import { ORDER_STATUSES, getOrderRoute, PRIORITIES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { playNotificationSound } from '@/shared/lib/sound'
import { supabase } from '@/shared/lib/supabase'

const PRODUCTION_STATUSES = new Set(COLS)

export function useProductionBoard() {
  const { profile } = useAuth()
  const [showMine, setShowMine] = useState(false)
  const [sortBy, setSortBy] = useState('created')
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [pendingMove, setPendingMove] = useState(null)
  const [todayDone, setTodayDone] = useState(0)
  const scrollRef = useRef(null)
  const [scrollState, setScrollState] = useState({ start: true, end: false })

  const { orders: allFetchedOrders, loading, error, refetch } = useOrders()

  useEffect(() => {
    async function fetchTodayDone() {
      try {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const { count, error } = await supabase
          .from('k24_order_status_history')
          .select('*', { count: 'exact', head: true })
          .eq('to_status', 'done')
          .gte('created_at', today.toISOString())
        if (error) throw error
        setTodayDone(count ?? 0)
      } catch (err) {
        captureError(err, { tags: { source: 'useProductionBoard.fetchTodayDone' } })
        setTodayDone(null)
      }
    }
    fetchTodayDone()
  }, [])

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
      const route = getOrderRoute(order)
      const fromIdx = route.indexOf(order.status)
      const toIdx = route.indexOf(targetStatus)

      if (fromIdx === -1 || toIdx === -1) {
        await updateOrderStatus(orderId, order.status, targetStatus)
      } else if (toIdx > fromIdx) {
        let currentStatus = order.status
        for (let i = fromIdx; i < toIdx; i++) {
          const nextStep = route[i + 1]
          try {
            await updateOrderStatus(orderId, currentStatus, nextStep)
            currentStatus = nextStep
          } catch (stepErr) {
            toast.error(`Не удалось обновить "${ORDER_STATUSES[currentStatus]?.label || currentStatus}": ${translateError(stepErr).message}`)
            return
          }
        }
      } else {
        await updateOrderStatus(orderId, order.status, targetStatus)
      }

      toast.success(`Заказ #${order.number} → ${ORDER_STATUSES[targetStatus]?.label}`)
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setPendingMove(null)
      refetch()
    }
  }

  return {
    profile,
    showMine, setShowMine,
    sortBy, setSortBy,
    search, setSearch,
    activeId, setActiveId,
    scrollRef, scrollState, setScrollState,
    loading, error, refetch,
    columns,
    activeOrder,
    total,
    todayDone,
    handleDragEnd,
  }
}
