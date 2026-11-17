import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { computeSubtaskOverallProgress, REPRINT_STAGE_QTY_FIELD } from '@/features/production/lib/production-logs'

// Только нефинансовые колонки (миграция 072: колоночный GRANT для authenticated).
// Колонки логов для прогресса — из той же карты, что и computeSubtaskStageProgress.
const LOG_COLS = ['id', 'subtask_id', 'stage', 'defects', 'deleted_at',
  ...new Set(Object.values(REPRINT_STAGE_QTY_FIELD))].join(', ')

const ORDER_COLS = 'id, number, custom_number, order_type, status, qty, width_mm, height_mm, deadline, priority, stickers_per_pack, client:k24_clients(name)'

/**
 * R25.3 (ТЗ Фаза 3.1) — допечатки для страницы «Заказы» (карточки, канбан,
 * календарь). Общий источник данных по образцу useReprintQueue: подзадачи
 * track='reprint' (без legacy) + заказ-родитель + прогресс из логов одним
 * запросом. Завершённые — только при includeDone (архив, как готовые заказы).
 * Допечатки отменённых заказов не показываем.
 *
 * Фильтрация (этап/поиск/срок) — на стороне страницы через
 * matchesReprintFilters: допечаток немного (~1 на 2 заказа), а чип
 * «Допечаток: N» на родителе должен видеть все активные.
 *
 * Реалтайм по k24_order_subtasks (uuid-суффикс канала).
 */
export function useActiveReprints({ includeDone = false, enabled = true } = {}) {
  const [reprints, setReprints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!enabled) { setReprints([]); setLoading(false); return }
    setError(null)
    try {
      let q = supabase
        .from('k24_order_subtasks')
        .select(`id, order_id, status, qty, title, item_idx, view_ref, route, paused, completed_at, created_at, order:k24_orders!order_id(${ORDER_COLS})`)
        .eq('track', 'reprint')
        .eq('is_legacy', false)
      if (!includeDone) q = q.neq('status', 'done')
      const { data: subs, error: sErr } = await q
      if (sErr) throw sErr

      const list = (subs || []).filter((s) => s.order && s.order.status !== 'cancelled')
      const ids = list.filter((s) => s.status !== 'done').map((s) => s.id)
      const logsBySub = {}
      if (ids.length) {
        const { data: logs, error: lErr } = await supabase
          .from('k24_production_logs')
          .select(LOG_COLS)
          .in('subtask_id', ids)
          .is('deleted_at', null)
        if (lErr) throw lErr
        for (const l of logs || []) {
          if (!logsBySub[l.subtask_id]) logsBySub[l.subtask_id] = []
          logsBySub[l.subtask_id].push(l)
        }
      }
      setReprints(list.map((s) => ({
        ...s,
        overall: computeSubtaskOverallProgress(s, logsBySub[s.id] || []),
      })))
    } catch (e) {
      setError(e)
      captureError(e, { tags: { source: 'useActiveReprints.fetch' } })
    } finally {
      setLoading(false)
    }
  }, [includeDone, enabled])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchRef = useRef(fetchData)
  useEffect(() => { fetchRef.current = fetchData }, [fetchData])
  useEffect(() => {
    if (!enabled) return
    const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
    const channel = supabase
      .channel(`active-reprints-${uid}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'k24_order_subtasks', filter: 'track=eq.reprint',
      }, () => fetchRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [enabled])

  return { reprints, loading, error, refetch: fetchData }
}

/**
 * R25.3 (ТЗ 3.3) — лёгкий счётчик допечаток заказа для бейджа вкладки
 * «Подзадачи» (только id/status, без логов). Реалтайм по подзадачам заказа.
 */
export function useOrderReprintStatuses(orderId) {
  const [rows, setRows] = useState([])

  const fetchData = useCallback(async () => {
    if (!orderId) { setRows([]); return }
    try {
      const { data, error } = await supabase
        .from('k24_order_subtasks')
        .select('id, status')
        .eq('order_id', orderId)
        .eq('track', 'reprint')
        .eq('is_legacy', false)
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      captureError(e, { tags: { source: 'useOrderReprintStatuses.fetch' }, extra: { orderId } })
    }
  }, [orderId])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchRef = useRef(fetchData)
  useEffect(() => { fetchRef.current = fetchData }, [fetchData])
  useEffect(() => {
    if (!orderId) return
    const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
    const channel = supabase
      .channel(`reprint-count-${orderId}-${uid}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'k24_order_subtasks', filter: `order_id=eq.${orderId}`,
      }, () => fetchRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orderId])

  return rows
}
