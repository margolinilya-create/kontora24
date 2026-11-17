import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useOrders, updateOrderStatus } from '@/features/orders/hooks/useOrders'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { COLS } from '../components/PipelineSummary'
import { ORDER_STATUSES, getOrderRoute, PRIORITIES, isStageAllowed, needsNoPaymentConfirm } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'
import { formatOrderNumber } from '@/shared/lib/utils'
import { playNotificationSound } from '@/shared/lib/sound'
import { supabase } from '@/shared/lib/supabase'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { useDebounce } from '@/shared/hooks/useDebounce'

const PRODUCTION_STATUSES = new Set(COLS)
const ARCHIVED_STATUSES = new Set(['done', 'cancelled'])

export function useProductionBoard({ includeArchived = false } = {}) {
  const { profile } = useAuth()
  const [showMine, setShowMine] = useState(false)
  const [sortBy, setSortBy] = useState('created')
  const [search, setSearch] = useState('')
  // Debounce: каждое нажатие пересобирает 11 buckets на 100-300 заказах,
  // на мобиле заметный лаг. Дебаунс 200ms — пользователь не успевает заметить.
  const debouncedSearch = useDebounce(search, 200)
  const [activeId, setActiveId] = useState(null)
  const [pendingMove, setPendingMove] = useState(null)
  const [todayDone, setTodayDone] = useState(0)
  const scrollRef = useRef(null)
  const [scrollState, setScrollState] = useState({ start: true, end: false })

  const { orders: allFetchedOrders, loading, error, refetch } = useOrders()

  const fetchTodayDone = useCallback(async () => {
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
  }, [])

  useEffect(() => { fetchTodayDone() }, [fetchTodayDone])
  useRefetchOnFocus(fetchTodayDone)

  const allOrders = useMemo(() => {
    const orders = allFetchedOrders.filter((o) =>
      PRODUCTION_STATUSES.has(o.status) || (includeArchived && ARCHIVED_STATUSES.has(o.status))
    )
    if (pendingMove) {
      return orders.map((o) =>
        o.id === pendingMove.orderId ? { ...o, status: pendingMove.targetStatus } : o
      )
    }
    return orders
  }, [allFetchedOrders, pendingMove, includeArchived])

  const filterAndSort = useCallback((orders) => {
    let filtered = showMine && profile ? orders.filter((o) => o.assigned_to === profile.id) : orders
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase()
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
  }, [showMine, profile, debouncedSearch, sortBy])

  const columns = useMemo(() => {
    const result = {}
    const allCols = includeArchived ? [...COLS, 'done', 'cancelled'] : COLS
    for (const s of allCols) {
      result[s] = filterAndSort(allOrders.filter((o) => o.status === s))
    }
    return result
  }, [allOrders, filterAndSort, includeArchived])

  const activeOrder = activeId ? allFetchedOrders.find((o) => o.id === activeId) : null
  const total = allOrders.length

  const prevCountRef = useRef(total)
  useEffect(() => {
    if (total > prevCountRef.current) {
      playNotificationSound()
    }
    prevCountRef.current = total
  }, [total])

  // R25.1 (ТЗ 1.3): перетаскивание за «Ждёт оплаты» без оплаты — через
  // подтверждение «Запустить без оплаты?». Ждущий подтверждения перенос.
  const [paymentConfirm, setPaymentConfirm] = useState(null)

  async function handleDragEnd(event) {
    setActiveId(null)
    const { active, over } = event
    if (!over || !active) return

    const orderId = active.id
    const order = allFetchedOrders.find((o) => o.id === orderId)
    if (!order) return

    const targetStatus = COLS.includes(over.id) ? over.id : over.data?.current?.status
    if (!targetStatus || targetStatus === order.status) return

    // Запрещаем drop в стадию, которая не входит в маршрут заказа
    // (без дизайна / без 3D / без ламинации). Откат разрешён через StatusOverride.
    if (!isStageAllowed(order, targetStatus)) {
      const stageLabel = ORDER_STATUSES[targetStatus]?.label || targetStatus
      toast.error(`Этап «${stageLabel}» не нужен для заказа #${formatOrderNumber(order)}`)
      return
    }

    if (needsNoPaymentConfirm(order, order.status, targetStatus)) {
      setPaymentConfirm({ order, targetStatus })
      return
    }
    await performMove(order, targetStatus)
  }

  function cancelPaymentMove() {
    setPaymentConfirm(null)
  }

  async function confirmPaymentMove() {
    const pending = paymentConfirm
    setPaymentConfirm(null)
    if (pending) await performMove(pending.order, pending.targetStatus, { confirmNoPayment: true })
  }

  async function performMove(order, targetStatus, moveOpts = {}) {
    const orderId = order.id
    setPendingMove({ orderId, targetStatus })

    try {
      const route = getOrderRoute(order)
      const fromIdx = route.indexOf(order.status)
      const toIdx = route.indexOf(targetStatus)

      if (fromIdx === -1 || toIdx === -1) {
        await updateOrderStatus(orderId, order.status, targetStatus)
      } else if (toIdx > fromIdx) {
        // Multi-step forward: пытаемся пройти всю цепочку.
        // При падении на шаге N откатываем заказ обратно на исходный статус
        // (через isRollback, чтобы обойти guard завершения этапа), чтобы не
        // оставить заказ в промежуточном состоянии.
        // R25.1: шаг может уйти дальше запрошенного (автопроход «Ждёт оплаты»)
        // — берём фактический статус из ответа updateOrderStatus.
        let currentStatus = order.status
        const originalStatus = order.status
        while (route.indexOf(currentStatus) > -1 && route.indexOf(currentStatus) < toIdx) {
          const nextStep = route[route.indexOf(currentStatus) + 1]
          try {
            const res = await updateOrderStatus(orderId, currentStatus, nextStep, moveOpts)
            currentStatus = res?.status || nextStep
          } catch (stepErr) {
            toast.error(`Не удалось обновить «${ORDER_STATUSES[currentStatus]?.label || currentStatus}» → «${ORDER_STATUSES[nextStep]?.label || nextStep}»: ${translateError(stepErr).message}`)
            // Откат: вернуть заказ на исходную стадию, если он успел сдвинуться.
            if (currentStatus !== originalStatus) {
              try {
                await updateOrderStatus(orderId, currentStatus, originalStatus, { isRollback: true, kind: 'rollback' })
                toast.error(`Заказ откачен на «${ORDER_STATUSES[originalStatus]?.label || originalStatus}»`)
              } catch (rollbackErr) {
                captureError(rollbackErr, { tags: { source: 'useProductionBoard.rollback' }, extra: { orderId, currentStatus, originalStatus } })
              }
            }
            return
          }
        }
      } else {
        await updateOrderStatus(orderId, order.status, targetStatus)
      }

      toast.success(`Заказ #${formatOrderNumber(order)} → ${ORDER_STATUSES[targetStatus]?.label}`)
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
    paymentConfirm, confirmPaymentMove, cancelPaymentMove,
  }
}
