import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'

export function useMaterials() {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchMaterials = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('materials')
      .select('*')
      .order('type', { ascending: true })
    setMaterials(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchMaterials() }, [fetchMaterials])

  return { materials, loading, refetch: fetchMaterials }
}

export function useMaterialTransactions(materialId) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!materialId) return
    async function fetch() {
      setLoading(true)
      const { data } = await supabase
        .from('material_transactions')
        .select('*, material:materials(name), created_by_profile:profiles!created_by(display_name)')
        .eq('material_id', materialId)
        .order('created_at', { ascending: false })
        .limit(50)
      setTransactions(data || [])
      setLoading(false)
    }
    fetch()
  }, [materialId])

  return { transactions, loading }
}

export async function addMaterialTransaction({ materialId, delta, reason, orderId }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('material_transactions').insert({
    material_id: materialId,
    delta,
    reason,
    order_id: orderId || null,
    created_by: user.id,
  })
  if (error) throw error

  // Atomic stock update via RPC
  const { error: rpcError } = await supabase.rpc('update_stock', {
    p_material_id: materialId,
    p_delta: delta,
  })
  if (rpcError) throw rpcError
}

export async function createMaterial({ type, name, unit, stockQty, minQty, pricePerUnit }) {
  const { data, error } = await supabase
    .from('materials')
    .insert({
      type,
      name,
      unit,
      stock_qty: stockQty || 0,
      min_qty: minQty || 0,
      price_per_unit: pricePerUnit || 0,
    })
    .select()
    .single()

  if (error) throw error
  return data
}
