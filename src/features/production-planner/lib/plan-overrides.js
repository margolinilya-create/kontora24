// R12.5 — API закреплений (k24_plan_overrides). Все мутации идут через
// этот сервис; компоненты не дёргают supabase напрямую — это упрощает
// optimistic update + revert при ошибке.

import { supabase } from '@/shared/lib/supabase'
import { usePlanStore } from '../store/plan-store'
import { captureError } from '@/shared/lib/sentry'
import { toast } from '@/shared/stores/toast-store'

/**
 * Закрепить этап заказа на конкретный день.
 * @param {{ orderId, stage, pinnedDate, userId? }} params
 */
export async function pinStage({ orderId, stage, pinnedDate, userId }) {
  if (!orderId || !stage || !pinnedDate) return { ok: false }
  const store = usePlanStore.getState()
  const existing = store.overrides.find((o) => o.order_id === orderId && o.stage === stage)
  // Оптимистично подменяем
  const optimistic = {
    id: existing?.id || `optimistic-${orderId}-${stage}`,
    order_id: orderId,
    stage,
    pinned_date: pinnedDate,
    created_by: userId || null,
    created_at: existing?.created_at || new Date().toISOString(),
  }
  store.upsertOverride(optimistic)

  try {
    const { data, error } = await supabase
      .from('k24_plan_overrides')
      .upsert(
        {
          order_id: orderId,
          stage,
          pinned_date: pinnedDate,
          created_by: userId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'order_id,stage' }
      )
      .select()
      .single()
    if (error) throw error
    // Подменяем фейковый id на настоящий
    store.removeOverride(optimistic.id)
    store.upsertOverride(data)
    return { ok: true, override: data }
  } catch (err) {
    // Revert
    if (existing) store.upsertOverride(existing)
    else store.removeOverride(optimistic.id)
    captureError(err, { tags: { source: 'plan-overrides.pinStage' } })
    toast.error(`Не удалось закрепить этап: ${err.message || err}`)
    return { ok: false, error: err }
  }
}

/**
 * Снять закрепление этапа.
 */
export async function unpinStage({ orderId, stage }) {
  const store = usePlanStore.getState()
  const existing = store.overrides.find((o) => o.order_id === orderId && o.stage === stage)
  if (!existing) return { ok: true }
  store.removeOverride(existing.id)
  try {
    const { error } = await supabase
      .from('k24_plan_overrides')
      .delete()
      .eq('order_id', orderId)
      .eq('stage', stage)
    if (error) throw error
    return { ok: true }
  } catch (err) {
    store.upsertOverride(existing)
    captureError(err, { tags: { source: 'plan-overrides.unpinStage' } })
    toast.error(`Не удалось снять закрепление: ${err.message || err}`)
    return { ok: false, error: err }
  }
}

/**
 * Снять все закрепления для заказа.
 */
export async function unpinAllForOrder(orderId) {
  const store = usePlanStore.getState()
  const before = store.overrides.filter((o) => o.order_id === orderId)
  if (before.length === 0) return { ok: true }
  for (const o of before) store.removeOverride(o.id)
  try {
    const { error } = await supabase
      .from('k24_plan_overrides')
      .delete()
      .eq('order_id', orderId)
    if (error) throw error
    return { ok: true, removed: before.length }
  } catch (err) {
    for (const o of before) store.upsertOverride(o)
    captureError(err, { tags: { source: 'plan-overrides.unpinAllForOrder' } })
    toast.error(`Не удалось снять закрепления заказа: ${err.message || err}`)
    return { ok: false, error: err }
  }
}

/**
 * Снять ВСЕ закрепления (кнопка «↺ Автоплан»).
 */
export async function unpinAll() {
  const store = usePlanStore.getState()
  const before = [...store.overrides]
  if (before.length === 0) return { ok: true }
  for (const o of before) store.removeOverride(o.id)
  try {
    const { error } = await supabase
      .from('k24_plan_overrides')
      .delete()
      .gt('id', '00000000-0000-0000-0000-000000000000') // удалить все строки
    if (error) throw error
    return { ok: true, removed: before.length }
  } catch (err) {
    for (const o of before) store.upsertOverride(o)
    captureError(err, { tags: { source: 'plan-overrides.unpinAll' } })
    toast.error(`Не удалось сбросить план: ${err.message || err}`)
    return { ok: false, error: err }
  }
}

/**
 * Режим «Только этап»: помимо закрепления перетаскиваемого этапа,
 * также фиксируем все остальные запланированные этапы заказа на их
 * текущих датах. Принимает map { stage → 'YYYY-MM-DD' } — даты берутся
 * из результата schedule() ДО drop'а (первый день в plannedStages.days).
 */
export async function pinStageWithFreeze({ orderId, droppedStage, droppedDate, otherStages, userId }) {
  // 1) Закрепляем основной
  const main = await pinStage({ orderId, stage: droppedStage, pinnedDate: droppedDate, userId })
  if (!main.ok) return main
  // 2) Закрепляем все остальные на их текущих датах
  for (const [stage, date] of Object.entries(otherStages || {})) {
    if (stage === droppedStage) continue
    if (!date) continue
    await pinStage({ orderId, stage, pinnedDate: date, userId })
  }
  return { ok: true }
}
