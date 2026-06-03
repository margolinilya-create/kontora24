// R12.2 — первичная загрузка + realtime подписки для планировщика.
// Подписки используют уникальный UUID-суффикс на имя канала, чтобы
// HMR/двойной маунт не приводил к "cannot add callbacks after subscribe()".
// См. feedback_supabase_realtime_channel_unique.md.

import { useEffect, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { usePlanStore } from '../store/plan-store'

// R13.0 (бриф 02.06): batch_layout удалён из активных маршрутов.
const ACTIVE_STATUSES = [
  'new', 'design', 'sample_layout', 'sample_print', 'color_approval',
  'prepress', 'print', 'lamination', 'cutting',
  'selection_pouring', 'pouring', 'drying', 'selection', 'assembly_3d',
  'packaging', 'otk',
]

const PLANNING_SETTING_KEYS = [
  'planning:norms',
  'planning:capacity',
  'planning:holidays_2026',
]

function makeChannelId(prefix) {
  const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
  return `${prefix}-${uid}`
}

async function loadInitial(store) {
  store.setLoading(true)
  try {
    // Активные заказы (исключаем done/cancelled — они не планируются)
    const [ordersR, logsR, itemsR, overridesR, settingsR] = await Promise.all([
      supabase
        .from('k24_orders')
        .select('id, number, custom_number, order_type, status, width_mm, height_mm, qty, design_variants, stickers_per_pack, need_lam, design_status, film_type, bopp_bag, priority, is_urgent, deadline, client_id, price_final, created_at, client:k24_clients!client_id(name)')
        .in('status', ACTIVE_STATUSES)
        .order('deadline', { ascending: true, nullsFirst: false }),
      supabase
        .from('k24_production_logs')
        .select('id, order_id, stage, track, stickers_printed, backgrounds_printed, lamination_qty, qty_cut, stickers_good, qty_selected, packs_assembled, packs_packaged, defects, deleted_at, created_at')
        .is('deleted_at', null),
      supabase
        .from('k24_order_items')
        .select('id, order_id, idx, width_mm, height_mm, qty'),
      supabase
        .from('k24_plan_overrides')
        .select('id, order_id, stage, pinned_date, created_by, created_at'),
      supabase
        .from('k24_settings')
        .select('key, value')
        .in('key', PLANNING_SETTING_KEYS),
    ])

    for (const r of [ordersR, logsR, itemsR, overridesR, settingsR]) {
      if (r.error) throw r.error
    }

    store.setOrders(ordersR.data || [])
    store.setLogs(logsR.data || [])
    store.setItems(itemsR.data || [])
    store.setOverrides(overridesR.data || [])

    const settingsMap = (settingsR.data || []).reduce((acc, row) => {
      acc[row.key] = row.value
      return acc
    }, {})
    store.setNorms(settingsMap['planning:norms'])
    store.setCapacity(settingsMap['planning:capacity'])
    store.setHolidays(settingsMap['planning:holidays_2026'] || [])

    store.setHydrated()
  } catch (err) {
    captureError(err, { tags: { source: 'usePlannerData.loadInitial' } })
    store.setError(err)
  }
}

// Обработчик postgres_changes для произвольной таблицы.
// upsertFn(row) / removeFn(id) — методы стора.
function makeRealtimeHandler({ upsertFn, removeFn, processedRef }) {
  return (payload) => {
    const id = payload.new?.id || payload.old?.id
    if (!id) return
    // Дедупликация по комбинации event+id+timestamp
    const key = `${payload.eventType}:${id}:${payload.commit_timestamp || ''}`
    if (processedRef.current.has(key)) return
    if (processedRef.current.size > 1000) processedRef.current.clear()
    processedRef.current.add(key)

    if (payload.eventType === 'DELETE') {
      removeFn(id)
      return
    }
    upsertFn(payload.new)
  }
}

export function usePlannerData() {
  const store = usePlanStore.getState() // stable methods reference
  const processedRef = useRef(new Set())

  useEffect(() => {
    let cancelled = false
    loadInitial(store).then(() => {
      if (cancelled) return
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const ordersCh = supabase
      .channel(makeChannelId('planner-orders'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_orders' },
        makeRealtimeHandler({
          upsertFn: (row) => {
            // Только активные заказы держим в сторе
            if (!ACTIVE_STATUSES.includes(row.status)) {
              usePlanStore.getState().removeOrder(row.id)
              return
            }
            usePlanStore.getState().upsertOrder(row)
          },
          removeFn: (id) => usePlanStore.getState().removeOrder(id),
          processedRef,
        }))
      .subscribe()

    const logsCh = supabase
      .channel(makeChannelId('planner-logs'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_production_logs' },
        makeRealtimeHandler({
          upsertFn: (row) => {
            if (row.deleted_at) {
              usePlanStore.getState().removeLog(row.id)
            } else {
              usePlanStore.getState().upsertLog(row)
            }
          },
          removeFn: (id) => usePlanStore.getState().removeLog(id),
          processedRef,
        }))
      .subscribe()

    const itemsCh = supabase
      .channel(makeChannelId('planner-items'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_order_items' },
        makeRealtimeHandler({
          upsertFn: (row) => usePlanStore.getState().upsertItem(row),
          removeFn: (id) => usePlanStore.getState().removeItem(id),
          processedRef,
        }))
      .subscribe()

    const overridesCh = supabase
      .channel(makeChannelId('planner-overrides'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_plan_overrides' },
        makeRealtimeHandler({
          upsertFn: (row) => usePlanStore.getState().upsertOverride(row),
          removeFn: (id) => usePlanStore.getState().removeOverride(id),
          processedRef,
        }))
      .subscribe()

    // Settings — отдельная подписка, чтобы при изменении нормативов/штата
    // моментально пересчитать без перезагрузки.
    const settingsCh = supabase
      .channel(makeChannelId('planner-settings'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_settings' },
        (payload) => {
          const row = payload.new
          if (!row || !PLANNING_SETTING_KEYS.includes(row.key)) return
          if (row.key === 'planning:norms') usePlanStore.getState().setNorms(row.value)
          if (row.key === 'planning:capacity') usePlanStore.getState().setCapacity(row.value)
          if (row.key === 'planning:holidays_2026') usePlanStore.getState().setHolidays(row.value || [])
        })
      .subscribe()

    return () => {
      supabase.removeChannel(ordersCh)
      supabase.removeChannel(logsCh)
      supabase.removeChannel(itemsCh)
      supabase.removeChannel(overridesCh)
      supabase.removeChannel(settingsCh)
    }
  }, [])
}
