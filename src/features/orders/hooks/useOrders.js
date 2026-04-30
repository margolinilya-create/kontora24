import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'

export function useOrders(filters = {}) {
  const [orders, setOrders] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('orders')
        .select('*, client:clients(name, phone), assignee:profiles!assigned_to(display_name, role)', { count: 'exact' })

      // Filters
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }
      if (filters.orderType && filters.orderType !== 'all') {
        query = query.eq('order_type', filters.orderType)
      }
      if (filters.search) {
        const s = filters.search.replace(/[,()]/g, '')
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
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters.status, filters.orderType, filters.search, filters.sortBy, filters.sortAsc, filters.from, filters.to])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders])

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
          .from('orders')
          .select('*, client:clients(*), assignee:profiles!assigned_to(*), creator:profiles!created_by(*)')
          .eq('id', id)
          .single(),
        supabase
          .from('order_status_history')
          .select('*, changed_by_profile:profiles!changed_by(display_name, role)')
          .eq('order_id', id)
          .order('created_at', { ascending: false }),
      ])
      if (orderRes.error) throw orderRes.error
      setOrder(orderRes.data)
      setHistory(historyRes.data || [])
    } catch (err) {
      setError(err.message)
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
      let query = supabase.from('profiles').select('id, display_name, role')
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
    .from('orders')
    .insert({ ...orderData, created_by: user.id, status: 'new' })
    .select()
    .single()
  if (error) throw error

  await supabase.from('order_status_history').insert({
    order_id: data.id, from_status: null, to_status: 'new', changed_by: user.id,
  })
  return data
}

export async function updateOrderStatus(orderId, fromStatus, toStatus) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('orders')
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq('id', orderId)
  if (error) throw error

  await supabase.from('order_status_history').insert({
    order_id: orderId, from_status: fromStatus, to_status: toStatus, changed_by: user.id,
  })

  // Auto-deduct materials when entering "print"
  if (toStatus === 'print') {
    await supabase.rpc('auto_deduct_materials', {
      p_order_id: orderId,
      p_changed_by: user.id,
    })
  }

  // Notify Bitrix24 about status change (fire-and-forget)
  try {
    const { data: order } = await supabase.from('orders').select('number, bitrix_deal_id, price_final, cost_total').eq('id', orderId).single()
    if (order?.bitrix_deal_id) {
      fetch('/api/bitrix/status-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          order_number: order.number,
          status: toStatus,
          price_final: order.price_final,
          cost_total: order.cost_total,
          bitrix_deal_id: order.bitrix_deal_id,
          bitrix_webhook_url: localStorage.getItem('bitrix_webhook_url') || '',
        }),
      }).catch(() => {}) // silent fail
    }
  } catch {} // non-critical
}

export async function updateOrder(orderId, updates) {
  const { error } = await supabase
    .from('orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', orderId)
  if (error) throw error
}
