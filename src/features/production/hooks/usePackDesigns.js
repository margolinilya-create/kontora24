import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'

/**
 * Виды стикеров в паке (k24_pack_designs).
 * Создаются триггером при INSERT в k24_orders для типов stickerpack/stickerpack3D.
 *
 * С 14.05: таблица хранит ТОЛЬКО метаданные вида (design_index, name, qty_target).
 * Прогресс по виду (напечатано / нарезано / залито) считается из k24_production_logs
 * по (stage, track='stickers', design_index) — единый источник правды с учётом worker_id.
 * Поэтому хук больше не пишет qty_poured/qty_defects и не отдаёт totals/allComplete.
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

  const updateName = useCallback(async (designId, name) => {
    const { error } = await supabase
      .from('k24_pack_designs')
      .update({ name: name || null })
      .eq('id', designId)
    if (error) throw error
    await fetchDesigns()
  }, [fetchDesigns])

  return { designs, loading, error, updateName, refetch: fetchDesigns }
}
