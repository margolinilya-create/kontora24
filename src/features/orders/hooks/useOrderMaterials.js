import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { diffOrderMaterials } from '@/features/warehouse/lib/order-material-categories'

const COLS = 'id, order_id, category_id, material_id'

/**
 * R25.7B (ТЗ 7.5): дополнительные материалы заказа (k24_order_materials).
 * До миграции 105 таблицы нет → считаем, что выбранных материалов нет.
 */
export async function fetchOrderMaterials(orderId) {
  if (!orderId) return []
  const { data, error } = await supabase
    .from('k24_order_materials')
    .select(COLS)
    .eq('order_id', orderId)
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw error
  }
  return data || []
}

export function useOrderMaterials(orderId) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(!!orderId)

  const load = useCallback(async () => {
    if (!orderId) { setRows([]); setLoading(false); return }
    try {
      setRows(await fetchOrderMaterials(orderId))
    } catch (err) {
      captureError(err, { tags: { source: 'useOrderMaterials.load' }, extra: { orderId } })
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { load() }, [load])

  return { rows, loading, refetch: load }
}

/**
 * Сохранить выбор доп. материалов заказа. Трогает только категории из
 * allowedCategoryIds (видимые в форме): выбранные — upsert по (order_id,
 * category_id), снятые — delete. Категории вне маршрута не удаляются, чтобы
 * смена маршрута не теряла выбор.
 */
export async function saveOrderMaterials(orderId, selection, allowedCategoryIds, current = null) {
  if (!orderId || !allowedCategoryIds?.length) return
  const cur = current ?? await fetchOrderMaterials(orderId)
  const { upserts, deletes } = diffOrderMaterials(cur, selection, allowedCategoryIds)
  if (upserts.length > 0) {
    const { error } = await supabase
      .from('k24_order_materials')
      .upsert(
        upserts.map((u) => ({ order_id: orderId, ...u, updated_at: new Date().toISOString() })),
        { onConflict: 'order_id,category_id' },
      )
    if (error) throw error
  }
  if (deletes.length > 0) {
    const { error } = await supabase.from('k24_order_materials').delete().in('id', deletes)
    if (error) throw error
  }
}
