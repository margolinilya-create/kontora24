import { supabase } from '@/shared/lib/supabase'
import { getOrderRoute } from '@/shared/constants'
import { computeOtkSummary, otkTargetQty } from '@/features/production/lib/production-logs'

/**
 * R25.2 (ТЗ 2.1): недостача годных после ТК — для подтверждения при выходе
 * с ТК («Годных меньше тиража на K. Всё равно передать на выдачу?»).
 * Тот же расчёт, что форма ТК (computeOtkSummary). Возвращает K (0 — нет
 * недостачи или учёта до ТК нет). Ошибку чтения пробрасывает — вызывающий
 * решает, блокировать ли переход.
 */
export async function fetchOtkShortage(order) {
  const [logsRes, itemsRes] = await Promise.all([
    supabase.from('k24_production_logs')
      .select('stage, track, subtask_id, item_idx, defect_stage, defects, deleted_at, stickers_printed, backgrounds_printed, lamination_qty, qty_cut, stickers_good, qty_selected, packs_assembled, packs_packaged, prepared_qty, sample_film_meters, qty_done')
      .eq('order_id', order.id)
      .is('deleted_at', null),
    supabase.from('k24_order_items').select('idx, qty').eq('order_id', order.id),
  ])
  if (logsRes.error) throw logsRes.error
  if (itemsRes.error) throw itemsRes.error
  const summary = computeOtkSummary(logsRes.data || [], getOrderRoute(order), otkTargetQty(order, itemsRes.data || []))
  return summary.shortage
}
