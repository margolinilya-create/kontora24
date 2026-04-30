import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'

export function useOrders(filters = {}) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('orders')
        .select('*, client:clients(name, phone), assignee:profiles!assigned_to(display_name, role)')
        .order('created_at', { ascending: false })

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }
      if (filters.orderType) {
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

      const { data, error: err } = await query
      if (err) throw err
      setOrders(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters.status, filters.orderType, filters.search])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchOrders])

  return { orders, loading, error, refetch: fetchOrders }
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

export async function createOrder(orderData) {
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('orders')
    .insert({
      ...orderData,
      created_by: user.id,
      status: 'new',
    })
    .select()
    .single()

  if (error) throw error

  // Log initial status
  await supabase.from('order_status_history').insert({
    order_id: data.id,
    from_status: null,
    to_status: 'new',
    changed_by: user.id,
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
    order_id: orderId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: user.id,
  })
}

export async function updateOrder(orderId, updates) {
  const { error } = await supabase
    .from('orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', orderId)

  if (error) throw error
}
