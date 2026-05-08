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

/**
 * Найти клиента по точному имени (case-insensitive, обрезаются пробелы) или создать нового.
 * Используется на форме создания заказа: менеджер вводит просто имя
 * заказчика, не выбирая из базы — но за кулисами связь через k24_clients
 * сохраняется для аналитики и LTV.
 *
 * Race condition: два менеджера одновременно ищут одно имя → оба не находят,
 * оба создают. На UNIQUE constraint (если он есть) второй упадёт. Catch'им
 * ошибку и повторяем поиск — вернём найденную запись от первого менеджера.
 */
export async function findOrCreateClientByName(name) {
  const trimmed = (name || '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return null
  // Экранируем PostgREST/SQL метасимволы для ilike (точный matchпо имени)
  const escaped = trimmed.replace(/[%_\\]/g, '\\$&')
  const { data: existing, error: searchErr } = await supabase
    .from('k24_clients')
    .select('id, name')
    .ilike('name', escaped)
    .limit(1)
  if (searchErr) throw searchErr
  if (existing && existing.length > 0) return existing[0]
  try {
    return await createClient({ name: trimmed })
  } catch (err) {
    // Race: другой клиент создан параллельно — повторяем поиск.
    if (err?.code === '23505' || /duplicate|unique/i.test(err?.message || '')) {
      const { data: retry } = await supabase
        .from('k24_clients')
        .select('id, name')
        .ilike('name', escaped)
        .limit(1)
      if (retry && retry.length > 0) return retry[0]
    }
    throw err
  }
}

export async function updateClient(id, updates) {
  const { error } = await supabase
    .from('k24_clients')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}
