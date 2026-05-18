import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'

/**
 * Подзадачи 3D-стикерпака — параллельные треки фоны/стикеры.
 * Каждый stickerpack3D заказ имеет 2 строки в k24_order_subtasks
 * (создаются триггером при INSERT). Продвижение — через RPC advance_subtask.
 *
 * Возвращает { subtasks: { backgrounds, stickers }, advance(track, toStatus) }.
 *
 * Миграция 032 (фидбэк менеджера 17.05).
 */
export function useOrderSubtasks(orderId, isPack3D) {
  const [subtasks, setSubtasks] = useState({ backgrounds: null, stickers: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSubtasks = useCallback(async () => {
    if (!orderId || !isPack3D) {
      setSubtasks({ backgrounds: null, stickers: null })
      setLoading(false)
      return
    }
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('k24_order_subtasks')
        .select('*')
        .eq('order_id', orderId)
      if (err) throw err
      const next = { backgrounds: null, stickers: null }
      for (const row of data || []) next[row.track] = row
      setSubtasks(next)
    } catch (err) {
      setError(err)
      captureError(err, { tags: { source: 'useOrderSubtasks.fetch' }, extra: { orderId } })
    } finally {
      setLoading(false)
    }
  }, [orderId, isPack3D])

  useEffect(() => { fetchSubtasks() }, [fetchSubtasks])

  // Realtime
  const fetchRef = useRef(fetchSubtasks)
  useEffect(() => { fetchRef.current = fetchSubtasks }, [fetchSubtasks])

  useEffect(() => {
    if (!orderId || !isPack3D) return
    // Уникальный channel name на каждое монтирование хука — иначе если
    // useOrderSubtasks вызывается дважды на странице (SubtaskIndicator +
    // CurrentStageWidget), supabase.channel() возвращает уже подписанный
    // канал и .on() крашит «cannot add callbacks after subscribe()».
    const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
    const channel = supabase
      .channel(`order-subtasks-${orderId}-${uid}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'k24_order_subtasks',
        filter: `order_id=eq.${orderId}`,
      }, () => fetchRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orderId, isPack3D])

  /**
   * Продвинуть подзадачу на следующий статус. Возвращает { ok, new_status, both_ready }.
   * Если both_ready === true — обе подзадачи в 'ready', UI должен предложить
   * перевести заказ на assembly_3d.
   */
  const advance = useCallback(async (track, toStatus) => {
    const sub = subtasks[track]
    if (!sub) throw new Error(`Подзадача "${track}" не найдена`)
    const { data, error: err } = await supabase.rpc('advance_subtask', {
      p_subtask_id: sub.id,
      p_to_status: toStatus,
    })
    if (err) throw err
    if (data?.ok === false) throw new Error(data.error || 'Не удалось продвинуть подзадачу')
    await fetchSubtasks()
    return data
  }, [subtasks, fetchSubtasks])

  return { subtasks, loading, error, refetch: fetchSubtasks, advance }
}
