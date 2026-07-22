import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { computeSubtaskOverallProgress } from '../lib/production-logs'

const ORDER_COLS = 'id, number, custom_number, order_type, qty, width_mm, height_mm, deadline, priority, created_at, client:k24_clients(name)'

/**
 * R22.1 (ТЗ 20.07 Фаза 1) — допечатки в очереди конкретного этапа.
 *
 * Статус reprint-подзадачи = ключ ORDER-этапа (print…packaging), поэтому
 * матчим напрямую по status === stage. Возвращает элементы с прогрессом,
 * посчитанным из production-логов подзадачи (одним запросом, без N+1).
 */
export function useReprintQueue(stage) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!stage) { setItems([]); setLoading(false); return }
    setLoading(true)
    const { data: subs, error } = await supabase
      .from('k24_order_subtasks')
      .select(`id, status, item_idx, qty, title, route, order:k24_orders!order_id(${ORDER_COLS})`)
      .eq('track', 'reprint')
      .eq('status', stage)
      .eq('paused', false)
      .eq('is_legacy', false)
    if (error) { setItems([]); setLoading(false); return }

    const ids = (subs || []).map((s) => s.id)
    let logsBySub = {}
    if (ids.length) {
      const { data: logs } = await supabase
        .from('k24_production_logs').select('*').in('subtask_id', ids).is('deleted_at', null)
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
    setLoading(false)
  }, [stage])

  useEffect(() => { fetchData() }, [fetchData])

  return { items, loading, refetch: fetchData }
}
