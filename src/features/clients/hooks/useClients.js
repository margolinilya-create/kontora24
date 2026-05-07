import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'

export function useClients(search = '') {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('k24_clients')
        .select('*, k24_orders(created_at)')
        .order('created_at', { ascending: false })

      if (search) {
        const s = search.replace(/[,()]/g, '')
        query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`)
      }

      const { data, error: err } = await query
      if (err) throw err
      const enriched = (data || []).map((client) => {
        const orders = client.k24_orders || []
        const lastOrderDate = orders.length > 0
          ? orders.reduce((latest, o) => {
              const d = new Date(o.created_at)
              return d > latest ? d : latest
            }, new Date(0)).toISOString()
          : null
        const { k24_orders: _omit, ...rest } = client
        return { ...rest, last_order_date: lastOrderDate }
      })
      setClients(enriched)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchClients() }, [fetchClients])
  useRefetchOnFocus(fetchClients)

  return { clients, loading, error, refetch: fetchClients }
}

export function useClientOrders(clientId) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!clientId) return
    async function fetch() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: err } = await supabase
          .from('k24_orders')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
        if (err) throw err
        setOrders(data || [])
      } catch (err) {
        setError(err)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [clientId])

  return { orders, loading, error }
}

export async function createClient({ name, phone, email, comment, tags }) {
  const { data, error } = await supabase
    .from('k24_clients')
    .insert({ name, phone, email, comment, tags: tags || [] })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateClient(id, updates) {
  const { error } = await supabase
    .from('k24_clients')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}
