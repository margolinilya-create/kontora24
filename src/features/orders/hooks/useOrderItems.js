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
 * R27.0: заменить состав видов заказа одной RPC `replace_order_items`
 * (миграция 110) — одна транзакция, без записи подзадач track='variant'
 * (браузеру запись в k24_order_subtasks запрещена с 032).
 *
 * Тираж заказа сервер пишет как сумму тиражей видов; размер заказа — размер
 * первого вида, если у него свой. Виды с учётом работы сервер не даёт убрать.
 *
 * @param {string} orderId
 * @param {Array<{ width_mm:number|null, height_mm:number|null, qty:number, src_idx?:number|null }>} items
 *   width/height null → общий размер заказа; src_idx — исходный номер вида
 *   (null — новый вид; без ключа — позиционно).
 * @param {number} [expectedCount=1] — сколько видов сейчас в базе (оптимистичная
 *   проверка: если кто-то уже поменял виды, сервер откажет). По умолчанию 1 —
 *   только что созданный заказ (триггер создал вид idx=1).
 */
export async function replaceOrderItems(orderId, items, expectedCount = 1) {
  if (!orderId || !Array.isArray(items) || items.length === 0) {
    throw new Error('Не удалось сохранить виды: пустой список')
  }
  if (!Number.isInteger(expectedCount) || expectedCount < 0) {
    throw new Error('Не удалось сохранить виды: не известно текущее число видов')
  }
  const payload = items.map((it) => {
    const w = Number(it.width_mm)
    const h = Number(it.height_mm)
    const row = {
      width_mm: w > 0 ? w : null,
      height_mm: h > 0 ? h : null,
      qty: Math.floor(Number(it.qty) || 0),
    }
    if (Object.prototype.hasOwnProperty.call(it, 'src_idx')) row.src_idx = it.src_idx ?? null
    return row
  })
  const { data, error } = await supabase.rpc('replace_order_items', {
    p_order_id: orderId,
    p_items: payload,
    p_expected_count: expectedCount,
  })
  if (error) throw error
  return data
}

/**
 * Ревью R25 (п.6): заказ с одним видом — синхронизировать idx=1 с основными
 * полями заказа (размер/тираж правятся в AdminOrderEditor). R27.0: через ту же
 * RPC. Если у заказа ещё нет строки вида (старый заказ) — expectedCount=0.
 */
export async function syncSingleOrderItem(orderId, { width_mm, height_mm, qty }, expectedCount = 1) {
  return replaceOrderItems(orderId, [{ width_mm, height_mm, qty }], expectedCount)
}
