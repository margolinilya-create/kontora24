import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'

/**
 * Виды стикеров в паке (k24_pack_designs).
 * Создаются триггером при INSERT в k24_orders для типов stickerpack/stickerpack3D.
 */
export function usePackDesigns(orderId) {
  const [designs, setDesigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchDesigns = useCallback(async () => {
    if (!orderId) {
      setDesigns([])
      setLoading(false)
      return
    }
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('k24_pack_designs')
        .select('*')
        .eq('order_id', orderId)
        .order('design_index', { ascending: true })
      if (err) throw err
      setDesigns(data || [])
    } catch (err) {
      setError(err)
      captureError(err, { tags: { source: 'usePackDesigns.fetch' }, extra: { orderId } })
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetchDesigns() }, [fetchDesigns])
  useRefetchOnFocus(fetchDesigns)

  // Realtime
  const fetchRef = useRef(fetchDesigns)
  useEffect(() => { fetchRef.current = fetchDesigns }, [fetchDesigns])

  useEffect(() => {
    if (!orderId) return
    const channel = supabase
      .channel(`pack-designs-${orderId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'k24_pack_designs',
        filter: `order_id=eq.${orderId}`,
      }, () => fetchRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orderId])

  /**
   * Increment qty_poured / qty_defects on a design (stage = заливка).
   */
  const addProgress = useCallback(async (designId, { poured = 0, defects = 0 }) => {
    const current = designs.find((d) => d.id === designId)
    if (!current) throw new Error('Вид не найден')
    const newPoured = (current.qty_poured || 0) + Number(poured || 0)
    const newDefects = (current.qty_defects || 0) + Number(defects || 0)
    if (newPoured + newDefects > current.qty_target) {
      const remaining = Math.max(0, current.qty_target - current.qty_poured - current.qty_defects)
      throw new Error(`Превышен тираж по виду #${current.design_index}. Осталось внести: ${remaining}`)
    }
    const { error } = await supabase
      .from('k24_pack_designs')
      .update({ qty_poured: newPoured, qty_defects: newDefects })
      .eq('id', designId)
    if (error) throw error
    await fetchDesigns()
  }, [designs, fetchDesigns])

  const updateName = useCallback(async (designId, name) => {
    const { error } = await supabase
      .from('k24_pack_designs')
      .update({ name: name || null })
      .eq('id', designId)
    if (error) throw error
    await fetchDesigns()
  }, [fetchDesigns])

  const totals = designs.reduce((acc, d) => {
    acc.target += d.qty_target
    acc.poured += d.qty_poured
    acc.defects += d.qty_defects
    return acc
  }, { target: 0, poured: 0, defects: 0 })

  const allComplete = designs.length > 0 && designs.every((d) => (d.qty_poured + d.qty_defects) >= d.qty_target)

  return { designs, totals, allComplete, loading, error, addProgress, updateName, refetch: fetchDesigns }
}
