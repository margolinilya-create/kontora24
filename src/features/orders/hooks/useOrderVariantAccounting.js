import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { accountingItemIdx, printedByItemIdx } from '../lib/order-variants'

/**
 * R27.0: учёт работы по видам заказа — для редактора видов.
 * Те же источники, что проверяет RPC replace_order_items (миграция 110):
 * логи с item_idx (включая удалённые) и допечатки с view_ref.
 *
 * @returns {{ accounting:number[], printed:Record<number,number>, loading:boolean, error:Error|null, refetch:Function }}
 */
export function useOrderVariantAccounting(orderId, orderType) {
  const [logs, setLogs] = useState([])
  const [reprints, setReprints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!orderId) {
      setLogs([]); setReprints([]); setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [logsRes, subRes] = await Promise.all([
        supabase
          .from('k24_production_logs')
          .select('item_idx, stage, stickers_printed, deleted_at')
          .eq('order_id', orderId)
          .not('item_idx', 'is', null),
        supabase
          .from('k24_order_subtasks')
          .select('view_ref')
          .eq('order_id', orderId)
          .eq('track', 'reprint')
          .not('view_ref', 'is', null),
      ])
      if (logsRes.error) throw logsRes.error
      if (subRes.error) throw subRes.error
      setLogs(logsRes.data || [])
      setReprints(subRes.data || [])
    } catch (err) {
      captureError(err, { tags: { source: 'useOrderVariantAccounting.fetch' }, extra: { orderId } })
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetchAll() }, [fetchAll])

  return {
    accounting: accountingItemIdx(logs, reprints, orderType),
    printed: printedByItemIdx(logs),
    loading,
    error,
    refetch: fetchAll,
  }
}
