import { useState, useEffect, useCallback, useId, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { isDualTrack, getNextStatus } from '@/shared/constants'
import { safeRpc } from '@/shared/lib/safeRpc'
import { captureError } from '@/shared/lib/sentry'

async function fetchWithRetry(url, options, retries = 3, delays = [1000, 5000, 15000]) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options)
      if (res.ok) return res
      if (i < retries) await new Promise(r => setTimeout(r, delays[i]))
    } catch {
      if (i < retries) await new Promise(r => setTimeout(r, delays[i]))
    }
  }
}

export function useOrders(filters = {}) {
  const hookId = useId()
  const [orders, setOrders] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('k24_orders')
        .select('*, client:k24_clients(name, phone), assignee:k24_profiles!assigned_to(display_name, role), attachments:k24_order_attachments(id, file_name, file_path, mime_type)', { count: 'exact' })

      // Filters
      if (filters.statuses && filters.statuses.length > 0) {
        query = query.in('status', filters.statuses)
      } else if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }
      if (filters.orderType && filters.orderType !== 'all') {
        query = query.eq('order_type', filters.orderType)
      }
      if (filters.deadlineFrom) {
        query = query.gte('deadline', filters.deadlineFrom)
      }
      if (filters.deadlineTo) {
        query = query.lte('deadline', filters.deadlineTo)
      }
      if (filters.search) {
        // Sanitize: remove PostgREST operators and escape SQL LIKE wildcards
        const s = filters.search.replace(/[,()]/g, '').replace(/[%_\\]/g, '\\$&')
        const num = parseInt(s, 10)
        if (!isNaN(num)) {
          query = query.or(`number.eq.${num},notes.ilike.%${s}%`)
        } else {
          query = query.ilike('notes', `%${s}%`)
        }
      }

      // Sort
      const sortCol = filters.sortBy || 'created_at'
      const sortAsc = filters.sortAsc ?? false
      query = query.order(sortCol, { ascending: sortAsc })

      // Pagination
      if (filters.from !== undefined && filters.to !== undefined) {
        query = query.range(filters.from, filters.to)
      }

      const { data, error: err, count } = await query
      if (err) throw err
      setOrders(data || [])
      setTotalCount(count || 0)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- statuses serialized to avoid array reference loops
  }, [filters.status, filters.statuses?.join(','), filters.orderType, filters.search, filters.sortBy, filters.sortAsc, filters.from, filters.to, filters.deadlineFrom, filters.deadlineTo])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  // Realtime — stable subscription (doesn't re-subscribe on filter change)
  const fetchRef = useRef(fetchOrders)
  useEffect(() => { fetchRef.current = fetchOrders }, [fetchOrders])

  const debounceRef = useRef(null)
  useEffect(() => {
    const channelName = `orders-${hookId.replace(/:/g, '')}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_orders' }, () => {
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => fetchRef.current(), 500)
      })
      .subscribe()
    return () => {
      clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [hookId])

  return { orders, totalCount, loading, error, refetch: fetchOrders }
}

export function useOrderDetail(id) {
  const [order, setOrder] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [orderRes, historyRes] = await Promise.all([
        supabase
          .from('k24_orders')
          .select('*, client:k24_clients(*), assignee:k24_profiles!assigned_to(*), creator:k24_profiles!created_by(*), attachments:k24_order_attachments(id, file_name, file_path, mime_type)')
          .eq('id', id)
          .single(),
        supabase
          .from('k24_order_status_history')
          .select('*, changed_by_profile:k24_profiles!changed_by(display_name, role)')
          .eq('order_id', id)
          .order('created_at', { ascending: false }),
      ])
      if (orderRes.error) throw orderRes.error
      setOrder(orderRes.data)
      setHistory(historyRes.data || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  return { order, history, loading, error, refetch: fetchDetail }
}

export function useProfiles(role) {
  const [profiles, setProfiles] = useState([])
  useEffect(() => {
    async function fetch() {
      let query = supabase.from('k24_profiles').select('id, display_name, role')
      if (role) query = query.eq('role', role)
      const { data } = await query.order('display_name')
      setProfiles(data || [])
    }
    fetch()
  }, [role])
  return profiles
}

export async function createOrder(orderData) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('k24_orders')
    .insert({ ...orderData, created_by: user.id, status: 'new' })
    .select()
    .single()
  if (error) throw error

  await supabase.from('k24_order_status_history').insert({
    order_id: data.id, from_status: null, to_status: 'new', changed_by: user.id,
  })

  // Reserve materials for the new order
  await supabase.rpc('reserve_materials', { p_order_id: data.id, p_changed_by: user.id })

  return data
}

export async function updateOrderStatus(orderId, fromStatus, toStatus) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('k24_orders')
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq('id', orderId)
  if (error) throw error

  await supabase.from('k24_order_status_history').insert({
    order_id: orderId, from_status: fromStatus, to_status: toStatus, changed_by: user.id,
  })

  // Auto-deduct materials when entering "print"
  if (toStatus === 'print') {
    await safeRpc('auto_deduct_materials',
      { p_order_id: orderId, p_changed_by: user.id },
      { source: 'updateOrderStatus.deduct', extra: { orderId, fromStatus, toStatus } })
    await safeRpc('consume_reservations',
      { p_order_id: orderId, p_changed_by: user.id },
      { source: 'updateOrderStatus.consume', extra: { orderId, fromStatus, toStatus } })
  }

  // Release reservations when order is cancelled
  if (toStatus === 'cancelled') {
    await safeRpc('release_materials',
      { p_order_id: orderId, p_changed_by: user.id },
      { source: 'updateOrderStatus.release', extra: { orderId, fromStatus, toStatus } })
  }

  // Notify Bitrix24 about status change (non-blocking with retry)
  try {
    const { data: order } = await supabase.from('k24_orders').select('number, bitrix_deal_id, price_final, cost_total').eq('id', orderId).single()
    if (order?.bitrix_deal_id) {
      fetchWithRetry('/api/bitrix/status-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          order_number: order.number,
          status: toStatus,
          price_final: order.price_final,
          cost_total: order.cost_total,
          bitrix_deal_id: order.bitrix_deal_id,
        }),
      }).catch(() => {}) // silent fail after all retries
    }
  } catch (err) {
    captureError(err, { tags: { source: 'updateOrderStatus.notifyBitrix' }, extra: { orderId } })
  }
}

/**
 * Add a production log entry and auto-advance status if stage target is met.
 * Core of the v2 quantity-based production tracking model.
 *
 * For stickerpack3D orders at dual-track stages (print, cutting, selection_pouring),
 * both tracks (backgrounds + stickers) must be complete before advancing.
 */
export async function addProductionLogAndCheckAdvance(orderId, stage, logData, order) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // 1. Insert production log (pass track field if present)
  const { error } = await supabase.from('k24_production_logs').insert({
    order_id: orderId,
    stage,
    worker_id: user.id,
    ...logData,
  })
  if (error) throw error

  // 2. Check if stage is complete

  // Get worker's actual role for permission check
  const { data: workerProfile } = await supabase
    .from('k24_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const workerRole = workerProfile?.role || 'post_printer'

  let isComplete = false

  try {
    if (isDualTrack(stage, order)) {
      // For dual-track stages on stickerpack3D: both tracks must be complete
      const [bgResult, stResult] = await Promise.all([
        supabase.rpc('check_stage_completion', {
          p_order_id: orderId,
          p_stage: stage,
          p_track: 'backgrounds',
        }),
        supabase.rpc('check_stage_completion', {
          p_order_id: orderId,
          p_stage: stage,
          p_track: 'stickers',
        }),
      ])
      isComplete = bgResult.data?.is_complete && stResult.data?.is_complete
    } else {
      const { data: result } = await supabase.rpc('check_stage_completion', {
        p_order_id: orderId,
        p_stage: stage,
      })
      isComplete = result?.is_complete
    }
  } catch (err) {
    captureError(err, {
      tags: { source: 'addProductionLogAndCheckAdvance.checkCompletion' },
      extra: { orderId, stage },
    })
    // isComplete остаётся false → advance не произойдёт, что безопаснее чем
    // продолжать с потенциально некорректным значением
  }

  // 3. Auto-advance if complete
  if (isComplete && order) {
    const nextStatus = getNextStatus(workerRole, order.status, order)
    if (nextStatus) {
      await updateOrderStatus(orderId, order.status, nextStatus)
    }
  }

  return { is_complete: isComplete }
}

export async function updateOrder(orderId, updates) {
  const { error } = await supabase
    .from('k24_orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', orderId)
  if (error) throw error
}

/**
 * Claim order with optimistic locking to prevent race conditions.
 * Uses conditional update: only succeeds if assigned_to matches expected value.
 */
export async function claimOrder(orderId, newOwnerId, expectedCurrentOwner) {
  let query = supabase
    .from('k24_orders')
    .update({ assigned_to: newOwnerId, updated_at: new Date().toISOString() })
    .eq('id', orderId)

  // Conditional check: if claiming unassigned order, verify it's still unassigned
  if (expectedCurrentOwner === null) {
    query = query.is('assigned_to', null)
  } else {
    query = query.eq('assigned_to', expectedCurrentOwner)
  }

  const { data, error, count } = await query.select()

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Заказ уже взят другим сотрудником')
  }
}
