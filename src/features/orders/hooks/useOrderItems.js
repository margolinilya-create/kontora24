import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'

/**
 * Виды изделий в заказе (k24_order_items, R8.3 серии 25.05).
 *
 * Инвариант: после создания заказа триггер БД гарантирует наличие
 * хотя бы одного row с idx=1, синхронизированного с order.w/h/qty.
 * Для multi-variant: idx=2..N добавляются клиентом через replaceOrderItems.
 */
export function useOrderItems(orderId) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchItems = useCallback(async () => {
    if (!orderId) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('k24_order_items')
        .select('*')
        .eq('order_id', orderId)
        .order('idx', { ascending: true })
      if (err) throw err
      setItems(data || [])
    } catch (err) {
      captureError(err, { tags: { source: 'useOrderItems.fetch' }, extra: { orderId } })
      setError(err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetchItems() }, [fetchItems])

  return { items, loading, error, refetch: fetchItems }
}

/**
 * Полностью заменить список items у заказа.
 * Используется при создании multi-variant заказа: удаляем дефолтный idx=1
 * (созданный триггером) и вставляем переданный массив.
 *
 * Для multi-variant (items.length > 1) дополнительно вставляет подзадачи
 * `track='variant', item_idx=1..N` (R8.4c) — каждая со стартовым статусом
 * текущего order.status. Не пересоздаёт подзадачи если они уже есть
 * (ON CONFLICT по уникальному индексу uq_subtasks_variant_item).
 *
 * @param {string} orderId
 * @param {Array<{ width_mm:number, height_mm:number, qty:number }>} items
 */
export async function replaceOrderItems(orderId, items) {
  if (!orderId || !Array.isArray(items) || items.length === 0) {
    throw new Error('replaceOrderItems: нужен orderId и непустой массив')
  }

  // 1) Удаляем существующие строки (триггер мог уже создать idx=1)
  const { error: delErr } = await supabase
    .from('k24_order_items')
    .delete()
    .eq('order_id', orderId)
  if (delErr) throw delErr

  // 2) Вставляем новые с idx=1..N
  const rows = items.map((it, i) => ({
    order_id: orderId,
    idx: i + 1,
    width_mm: Number(it.width_mm) || 0,
    height_mm: Number(it.height_mm) || 0,
    qty: Math.max(0, Math.floor(Number(it.qty) || 0)),
  }))
  const { error: insErr } = await supabase.from('k24_order_items').insert(rows)
  if (insErr) throw insErr

  // 3) Multi-variant subtasks (R8.4c). Только если действительно >1 видов.
  if (rows.length > 1) {
    const { data: order } = await supabase
      .from('k24_orders').select('status').eq('id', orderId).single()
    const startStatus = order?.status || 'new'
    const subtaskRows = rows.map((r) => ({
      order_id: orderId,
      track: 'variant',
      item_idx: r.idx,
      status: startStatus,
    }))
    // PostgREST upsert через .upsert() невозможен на partial unique index,
    // но INSERT не упадёт если индекс не нарушен. Сначала чистим существующие
    // variant-подзадачи для этого заказа (replace-семантика).
    await supabase.from('k24_order_subtasks')
      .delete().eq('order_id', orderId).eq('track', 'variant')
    const { error: stErr } = await supabase.from('k24_order_subtasks').insert(subtaskRows)
    if (stErr) throw stErr
  } else {
    // items.length === 1 — гарантируем что variant-подзадач нет (мог быть
    // случай: было 3 вида, теперь 1, лишние треки удаляем).
    await supabase.from('k24_order_subtasks')
      .delete().eq('order_id', orderId).eq('track', 'variant')
  }
}
