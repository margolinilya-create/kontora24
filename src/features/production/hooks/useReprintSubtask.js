import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { captureError } from '@/shared/lib/sentry'
import { computeSubtaskStageProgress } from '../lib/production-logs'

const ORDER_COLS = 'id, number, custom_number, order_type, qty, width_mm, height_mm, film_type, film_type_stickers, lam_type, need_lam, design_status, stickers_per_pack, design_variants, sticker_shape, deadline, priority, client_id, client:k24_clients(name), film_material:k24_materials!film_material_id(id, name), film_stickers_material:k24_materials!film_stickers_material_id(id, name), lam_material:k24_materials!lam_material_id(id, name)'

/**
 * R22.1 (ТЗ 20.07 Фаза 1) — одна подзадача-допечатка для страницы
 * /production/subtask/:subtaskId. Грузит подзадачу + заказ (нефинансовые
 * колонки) + её production-логи. Реалтайм по подзадаче и логам.
 *
 * addLogAndAdvance(stage, data): пишет лог с subtask_id и, если внесённого
 * количества достаточно (>= qty), автоматически продвигает подзадачу на
 * следующий этап маршрута (ТЗ 3.4.6). Возвращает { advanced, new_status }.
 */
export function useReprintSubtask(subtaskId) {
  const { profile } = useAuth()
  const [subtask, setSubtask] = useState(null)
  const [order, setOrder] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!subtaskId) return
    setError(null)
    try {
      const { data: sub, error: sErr } = await supabase
        .from('k24_order_subtasks').select('*').eq('id', subtaskId).single()
      if (sErr) throw sErr
      setSubtask(sub)

      const [{ data: ord, error: oErr }, { data: lg, error: lErr }] = await Promise.all([
        supabase.from('k24_orders').select(ORDER_COLS).eq('id', sub.order_id).single(),
        supabase.from('k24_production_logs').select('*, worker:k24_profiles!worker_id(display_name, role)')
          .eq('subtask_id', subtaskId).is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ])
      if (oErr) throw oErr
      if (lErr) throw lErr
      let orderData = ord
      // Имя заказчика через RPC (RLS k24_clients ограничен admin/manager).
      if (orderData && orderData.client_id && !orderData.client?.name) {
        const { data: clientName } = await supabase.rpc('k24_order_client_name', { p_order_id: orderData.id })
        if (clientName) orderData = { ...orderData, client: { ...(orderData.client || {}), name: clientName } }
      }
      setOrder(orderData)
      setLogs(lg || [])
    } catch (e) {
      setError(e)
      captureError(e, { tags: { source: 'useReprintSubtask.fetch' }, extra: { subtaskId } })
    } finally {
      setLoading(false)
    }
  }, [subtaskId])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchRef = useRef(fetchData)
  useEffect(() => { fetchRef.current = fetchData }, [fetchData])
  useEffect(() => {
    if (!subtaskId) return
    const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
    const channel = supabase
      .channel(`reprint-detail-${subtaskId}-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_order_subtasks', filter: `id=eq.${subtaskId}` }, () => fetchRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'k24_production_logs', filter: `subtask_id=eq.${subtaskId}` }, () => fetchRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [subtaskId])

  const addLogAndAdvance = useCallback(async (stage, data) => {
    if (!profile) throw new Error('Не авторизован')
    if (!subtask) throw new Error('Допечатка не загружена')
    const { error: insErr } = await supabase.from('k24_production_logs').insert({
      order_id: subtask.order_id,
      subtask_id: subtask.id,
      stage,
      worker_id: profile.id,
      ...data,
    })
    if (insErr) throw insErr

    // Пересчитываем прогресс этапа с учётом только что внесённого лога.
    const { data: fresh } = await supabase
      .from('k24_production_logs').select('*')
      .eq('subtask_id', subtask.id).eq('stage', stage).is('deleted_at', null)
    const prog = computeSubtaskStageProgress(fresh || [], stage, subtask.qty)

    let advanced = false
    let newStatus = subtask.status
    if (prog.isComplete) {
      const { data: adv, error: advErr } = await supabase.rpc('advance_reprint_subtask', {
        p_subtask_id: subtask.id, p_expected_status: stage,
      })
      if (advErr) throw advErr
      if (adv?.ok) { advanced = true; newStatus = adv.new_status }
    }
    await fetchData()
    return { advanced, new_status: newStatus }
  }, [profile, subtask, fetchData])

  return { subtask, order, logs, loading, error, refetch: fetchData, addLogAndAdvance }
}
