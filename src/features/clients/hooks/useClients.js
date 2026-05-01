import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'

export function useClients(search = '') {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('clients')
      .select('*, orders(created_at)')
      .order('created_at', { ascending: false })

    if (search) {
      const s = search.replace(/[,()]/g, '')
      query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`)
    }

    const { data } = await query
    // Compute last_order_date from embedded orders
    const enriched = (data || []).map((client) => {
      const orders = client.orders || []
      const lastOrderDate = orders.length > 0
        ? orders.reduce((latest, o) => {
            const d = new Date(o.created_at)
            return d > latest ? d : latest
          }, new Date(0)).toISOString()
        : null
      const { orders: _, ...rest } = client
      return { ...rest, last_order_date: lastOrderDate }
    })
    setClients(enriched)
    setLoading(false)
  }, [search])

  useEffect(() => { fetchClients() }, [fetchClients])

  return { clients, loading, refetch: fetchClients }
}

export function useClientOrders(clientId) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientId) return
    async function fetch() {
      setLoading(true)
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      setOrders(data || [])
      setLoading(false)
    }
    fetch()
  }, [clientId])

  return { orders, loading }
}

export async function createClient({ name, phone, email, comment, tags }) {
  const { data, error } = await supabase
    .from('clients')
    .insert({ name, phone, email, comment, tags: tags || [] })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateClient(id, updates) {
  const { error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}
