import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'

export function useClients(search = '') {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data } = await query
    setClients(data || [])
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
