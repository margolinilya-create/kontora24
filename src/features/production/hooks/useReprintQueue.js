import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { generateUuid } from '@/shared/lib/uuid'
import { computeSubtaskOverallProgress } from '../lib/production-logs'

const ORDER_COLS = 'id, number, custom_number, order_type, product_name, qty, width_mm, height_mm, deadline, priority, created_at, client:k24_clients(name)'

/**
 * R22.1 (ТЗ 20.07 Фаза 1) — допечатки в очереди конкретного этапа.
 *
 * Статус reprint-подзадачи = ключ ORDER-этапа (print…packaging), поэтому
 * матчим напрямую по status === stage. Возвращает элементы с прогрессом,
 * посчитанным из production-логов подзадачи (одним запросом, без N+1).
 *
 * Ревью 17.11: ошибка загрузки возвращается в `error` (+ Sentry), а не
 * превращается молча в пустую очередь; loading=true только на первую
 * загрузку (рефетч не прячет очередь за спиннером); realtime по подзадачам
 * и их логам — допечатка, пришедшая на этап, появляется без перезахода.
 */
export function useReprintQueue(stage) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Этап, для которого очередь уже загружена: смена этапа — снова «первая»
  // загрузка (спиннер вместо чужой очереди), рефетч того же этапа — фоном.
  const loadedForRef = useRef(null)

  const fetchData = useCallback(async () => {
    if (!stage) { setItems([]); setError(null); setLoading(false); return }
    if (loadedForRef.current !== stage) setLoading(true)
    try {
      const { data: subs, error: subsErr } = await supabase
        .from('k24_order_subtasks')
        .select(`id, status, item_idx, qty, title, route, order:k24_orders!order_id(${ORDER_COLS})`)
        .eq('track', 'reprint')
        .eq('status', stage)
        .eq('paused', false)
        .eq('is_legacy', false)
      if (subsErr) throw subsErr

      const ids = (subs || []).map((s) => s.id)
      const logsBySub = {}
      if (ids.length) {
        const { data: logs, error: logsErr } = await supabase
          .from('k24_production_logs').select('*').in('subtask_id', ids).is('deleted_at', null)
        if (logsErr) throw logsErr
        for (const l of logs || []) {
          if (!logsBySub[l.subtask_id]) logsBySub[l.subtask_id] = []
          logsBySub[l.subtask_id].push(l)
        }
      }

      const list = (subs || [])
        .filter((s) => s.order)
        .map((s) => ({
          order: s.order,
          subtask: s,
          overall: computeSubtaskOverallProgress(s, logsBySub[s.id] || []),
        }))
      setItems(list)
      setError(null)
    } catch (err) {
      captureError(err, { tags: { source: 'useReprintQueue.fetchData' } })
      setError(err)
    } finally {
      loadedForRef.current = stage
      setLoading(false)
    }
  }, [stage])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchRef = useRef(fetchData)
  useEffect(() => { fetchRef.current = fetchData }, [fetchData])

  useEffect(() => {
    if (!stage) return
    const uid = generateUuid() || Math.random().toString(36).slice(2)
    const channel = supabase
      .channel(`reprint-queue-${stage}-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_order_subtasks' }, (payload) => {
        const track = payload.new?.track ?? payload.old?.track
        if (track && track !== 'reprint') return
        fetchRef.current()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_production_logs' }, (payload) => {
        if (payload.new?.subtask_id || payload.old?.subtask_id) fetchRef.current()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [stage])

  return { items, loading, error, refetch: fetchData }
}
