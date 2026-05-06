import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'

export function useMaterials() {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchMaterials = useCallback(async () => {
    setLoading(true)
    setError(null)
    let data, reservations
    try {
      const results = await Promise.all([
        supabase
          .from('k24_materials')
          .select('*')
          .order('type', { ascending: true }),
        supabase
          .from('k24_material_transactions')
          .select('material_id, delta')
          .eq('reservation_status', 'reserved'),
      ])
      data = results[0].data
      reservations = results[1].data
      if (results[0].error) throw results[0].error
    } catch (err) {
      setError(err)
      setLoading(false)
      return
    }

    // Sum reserved amounts per material
    const reservedByMaterial = {}
    ;(reservations || []).forEach(r => {
      reservedByMaterial[r.material_id] = (reservedByMaterial[r.material_id] || 0) + Math.abs(Number(r.delta))
    })

    const materialsWithReservations = (data || []).map(m => ({
      ...m,
      reserved: reservedByMaterial[m.id] || 0,
      available: Math.max(0, Number(m.stock_qty) - (reservedByMaterial[m.id] || 0)),
    }))

    setMaterials(materialsWithReservations)
    setLoading(false)
  }, [])

  useEffect(() => { fetchMaterials() }, [fetchMaterials])

  return { materials, loading, error, refetch: fetchMaterials }
}

export function useMaterialTransactions(materialId) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!materialId) return
    async function fetch() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: err } = await supabase
          .from('k24_material_transactions')
          .select('*, material:k24_materials(name), created_by_profile:k24_profiles!created_by(display_name)')
          .eq('material_id', materialId)
          .order('created_at', { ascending: false })
          .limit(50)
        if (err) throw err
        setTransactions(data || [])
      } catch (err) {
        captureError(err, { tags: { source: 'useMaterialTransactions.fetch' }, extra: { materialId } })
        setError(err)
        setTransactions([])
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [materialId])

  return { transactions, loading, error }
}

export async function addMaterialTransaction({ materialId, delta, reason, orderId }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: txn, error } = await supabase.from('k24_material_transactions').insert({
    material_id: materialId,
    delta,
    reason,
    order_id: orderId || null,
    created_by: user.id,
  }).select('id').single()
  if (error) throw error

  // Atomic stock update via RPC — rollback transaction record on failure
  const { error: rpcError } = await supabase.rpc('update_stock', {
    p_material_id: materialId,
    p_delta: delta,
  })
  if (rpcError) {
    // Rollback: delete the orphan transaction record
    await supabase.from('k24_material_transactions').delete().eq('id', txn.id)
    throw rpcError
  }
}

export async function createMaterial({ type, name, unit, stockQty, minQty, pricePerUnit }) {
  const { data, error } = await supabase
    .from('k24_materials')
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
