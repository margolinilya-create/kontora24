import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'

/**
 * Подзадачи заказа — параллельные треки.
 *
 * 1) stickerpack3D: 2 треки фоны/стикеры (миграция 032).
 * 2) Multi-variant заказы (R8.4c, миграция 040): по одной подзадаче на
 *    каждый item из k24_order_items, track='variant', item_idx=1..N.
 *
 * Хук грузит обе категории подзадач сразу (если они есть) и возвращает:
 *   { subtasks: { backgrounds, stickers }, variants: [array], advance(track, toStatus), advanceVariant(itemIdx, toStatus) }
 *
 * `isMulti` — режим: грузить ли подзадачи. Передаётся из вызывающего
 * компонента (isPack3D || hasVariants).
 */
export function useOrderSubtasks(orderId, _isMulti) {
  // R11.3: грузим все подзадачи независимо от _isMulti (extra_stickers может
  // появиться у любого типа заказа после кнопки CreateExtraStickers). Аргумент
  // оставлен в сигнатуре чтобы не ломать существующие вызовы; ранее использовался
  // для skip-логики, теперь load всегда полный.
  const [subtasks, setSubtasks] = useState({ backgrounds: null, stickers: null })
  const [variants, setVariants] = useState([])
  const [extras, setExtras] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSubtasks = useCallback(async () => {
    if (!orderId) {
      setSubtasks({ backgrounds: null, stickers: null })
      setVariants([])
      setExtras([])
      setLoading(false)
      return
    }
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('k24_order_subtasks')
        .select('*')
        .eq('order_id', orderId)
        .order('item_idx', { ascending: true, nullsFirst: true })
      if (err) throw err
      const next = { backgrounds: null, stickers: null }
      const vars = []
      const exts = []
      for (const row of data || []) {
        if (row.track === 'variant') vars.push(row)
        else if (row.track === 'extra_stickers') exts.push(row)
        else next[row.track] = row
      }
      setSubtasks(next)
      setVariants(vars)
      setExtras(exts)
    } catch (err) {
      setError(err)
      captureError(err, { tags: { source: 'useOrderSubtasks.fetch' }, extra: { orderId } })
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetchSubtasks() }, [fetchSubtasks])

  // Realtime
  const fetchRef = useRef(fetchSubtasks)
  useEffect(() => { fetchRef.current = fetchSubtasks }, [fetchSubtasks])

  useEffect(() => {
    if (!orderId) return
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
  }, [orderId])

  const advanceById = useCallback(async (subtaskId, toStatus) => {
    const { data, error: err } = await supabase.rpc('advance_subtask', {
      p_subtask_id: subtaskId, p_to_status: toStatus,
    })
    if (err) throw err
    if (data?.ok === false) throw new Error(data.error || 'Не удалось продвинуть подзадачу')
    await fetchSubtasks()
    return data
  }, [fetchSubtasks])

  /**
   * Продвинуть подзадачу bg/stickers (3D-pack) на toStatus.
   */
  const advance = useCallback(async (track, toStatus) => {
    const sub = subtasks[track]
    if (!sub) throw new Error(`Подзадача "${track}" не найдена`)
    return advanceById(sub.id, toStatus)
  }, [subtasks, advanceById])

  /**
   * Продвинуть подзадачу-вариант (multi-variant) на toStatus.
   */
  const advanceVariant = useCallback(async (itemIdx, toStatus) => {
    const sub = variants.find((v) => v.item_idx === itemIdx)
    if (!sub) throw new Error(`Подзадача вида ${itemIdx} не найдена`)
    return advanceById(sub.id, toStatus)
  }, [variants, advanceById])

  /**
   * R11.3: создать подзадачу «Стикеры дополнительно» с qty по видам.
   * @param {object} designsByIdx — { 1: 10, 2: 5 } — для каждого design_index сколько нужно
   */
  const createExtraStickers = useCallback(async (designsByIdx) => {
    const { data, error: err } = await supabase.rpc('create_extra_stickers_subtask', {
      p_order_id: orderId, p_designs: designsByIdx,
    })
    if (err) throw err
    if (data?.ok === false) throw new Error(data.error || 'Не удалось создать подзадачу')
    await fetchSubtasks()
    return data
  }, [orderId, fetchSubtasks])

  return {
    subtasks, variants, extras, loading, error,
    refetch: fetchSubtasks,
    advance, advanceVariant, advanceById,
    createExtraStickers,
  }
}
