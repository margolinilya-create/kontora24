import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { getReprintRoute } from '@/shared/constants'
import { computeSubtaskOverallProgress, reprintUiStatus } from '@/features/production/lib/production-logs'

/**
 * R22.1 (ТЗ 20.07 Фаза 1) — подзадачи-допечатки заказа.
 *
 * Грузит reprint-подзадачи + их production-логи (для прогресса карточек) и
 * legacy-подзадачи старой системы (bg/stickers/extra_stickers) в режиме
 * read-only. Реалтайм по k24_order_subtasks заказа.
 *
 * Возвращает:
 *   { reprints, legacy, loading, error, refetch,
 *     createReprint(order, {qty, reason, comment}), renameReprint(id, title),
 *     pauseReprint(id, paused) }
 */
export function useReprintSubtasks(orderId) {
  const [rows, setRows] = useState([])
  const [logsBySubtask, setLogsBySubtask] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!orderId) { setRows([]); setLogsBySubtask({}); setLoading(false); return }
    setError(null)
    try {
      const { data: subs, error: err } = await supabase
        .from('k24_order_subtasks')
        .select('*')
        .eq('order_id', orderId)
        .order('item_idx', { ascending: true, nullsFirst: true })
      if (err) throw err
      setRows(subs || [])

      const reprintIds = (subs || []).filter((s) => s.track === 'reprint').map((s) => s.id)
      if (reprintIds.length) {
        const { data: logs, error: lErr } = await supabase
          .from('k24_production_logs')
          .select('*')
          .in('subtask_id', reprintIds)
          .is('deleted_at', null)
        if (lErr) throw lErr
        const grouped = {}
        for (const l of logs || []) {
          if (!grouped[l.subtask_id]) grouped[l.subtask_id] = []
          grouped[l.subtask_id].push(l)
        }
        setLogsBySubtask(grouped)
      } else {
        setLogsBySubtask({})
      }
    } catch (e) {
      setError(e)
      captureError(e, { tags: { source: 'useReprintSubtasks.fetch' }, extra: { orderId } })
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchRef = useRef(fetchData)
  useEffect(() => { fetchRef.current = fetchData }, [fetchData])
  useEffect(() => {
    if (!orderId) return
    const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
    const channel = supabase
      .channel(`reprints-${orderId}-${uid}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'k24_order_subtasks',
        filter: `order_id=eq.${orderId}`,
      }, () => fetchRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orderId])

  const createReprint = useCallback(async (order, { qty, reason, comment }) => {
    const route = getReprintRoute(order)
    const { data, error: err } = await supabase.rpc('create_reprint_subtask', {
      p_order_id: orderId,
      p_qty: Number(qty),
      p_reason: reason || null,
      p_comment: comment || null,
      p_route: route,
    })
    if (err) throw err
    if (data?.ok === false) throw new Error(data.error || 'Не удалось создать допечатку')
    await fetchData()
    return data
  }, [orderId, fetchData])

  const renameReprint = useCallback(async (id, title) => {
    const { error: err } = await supabase
      .from('k24_order_subtasks').update({ title }).eq('id', id)
    if (err) throw err
    await fetchData()
  }, [fetchData])

  const pauseReprint = useCallback(async (id, paused) => {
    const { error: err } = await supabase
      .from('k24_order_subtasks').update({ paused }).eq('id', id)
    if (err) throw err
    await fetchData()
  }, [fetchData])

  const reprints = rows
    .filter((s) => s.track === 'reprint')
    .map((s) => {
      const logs = logsBySubtask[s.id] || []
      return { ...s, logs, overall: computeSubtaskOverallProgress(s, logs), uiStatus: reprintUiStatus(s, logs) }
    })
  const legacy = rows.filter((s) => s.track !== 'reprint')

  return { reprints, legacy, loading, error, refetch: fetchData, createReprint, renameReprint, pauseReprint }
}
