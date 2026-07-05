import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'

/**
 * Виды стикеров в паке (k24_pack_designs).
 * Создаются триггером при INSERT в k24_orders для типов stickerpack/stickerpack3D.
 *
 * С 14.05: таблица хранит ТОЛЬКО метаданные вида (design_index, name, qty_target).
 * Прогресс по виду (напечатано / нарезано / залито) считается из k24_production_logs
 * по (stage, track='stickers', design_index) — единый источник правды с учётом worker_id.
 * Поэтому хук больше не пишет qty_poured/qty_defects и не отдаёт totals/allComplete.
 */
export function usePackDesigns(orderId) {
  // Keep-prev-on-refetch: при перезагрузке (тот же orderId) НЕ сбрасываем designs в [],
  // иначе родитель размонтирует PackDesignsForm и потеряет локальный state drafts
  // (фидбэк 17.05 — теряются введённые числа в других видах при сохранении одного).
  const [designs, setDesigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchDesigns = useCallback(async () => {
    if (!orderId) {
      setDesigns([])
      setLoading(false)
      return
    }
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('k24_pack_designs')
        .select('*')
        .eq('order_id', orderId)
        .order('design_index', { ascending: true })
      if (err) throw err
      setDesigns(data || [])
    } catch (err) {
      setError(err)
      captureError(err, { tags: { source: 'usePackDesigns.fetch' }, extra: { orderId } })
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetchDesigns() }, [fetchDesigns])
  useRefetchOnFocus(fetchDesigns)

  // Realtime
  const fetchRef = useRef(fetchDesigns)
  useEffect(() => { fetchRef.current = fetchDesigns }, [fetchDesigns])

  useEffect(() => {
    if (!orderId) return
    // Уникальный channel name на монтирование — защита от конфликта если хук
    // вызывается дважды на странице (см. useProductionLogs/useOrderSubtasks).
    const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
    const channel = supabase
      .channel(`pack-designs-${orderId}-${uid}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'k24_pack_designs',
        filter: `order_id=eq.${orderId}`,
      }, () => fetchRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orderId])

  const updateName = useCallback(async (designId, name) => {
    const { error } = await supabase
      .from('k24_pack_designs')
      .update({ name: name || null })
      .eq('id', designId)
    if (error) throw error
    await fetchDesigns()
  }, [fetchDesigns])

  // R19: форма стикера по виду (влияет на ставку заливки).
  const updateShape = useCallback(async (designId, shape) => {
    const { error } = await supabase
      .from('k24_pack_designs')
      .update({ shape_type: shape || 'standard' })
      .eq('id', designId)
    if (error) throw error
    await fetchDesigns()
  }, [fetchDesigns])

  // R14.3 (бриф 03.06): обновить план к печати на этапе препресс по виду.
  // Если qty_target=0 — заодно подтягиваем qty_planned в qty_target,
  // чтобы прогресс-бар на следующих этапах считал корректно.
  const updateQtyPlanned = useCallback(async (designIndex, qtyPlanned) => {
    const d = designs.find((dd) => dd.design_index === designIndex)
    if (!d) throw new Error(`design_index ${designIndex} not found`)
    const update = { qty_planned: Number(qtyPlanned) || 0 }
    if (!d.qty_target || d.qty_target <= 0) update.qty_target = Number(qtyPlanned) || 0
    const { error } = await supabase
      .from('k24_pack_designs')
      .update(update)
      .eq('id', d.id)
    if (error) throw error
    await fetchDesigns()
  }, [designs, fetchDesigns])

  return { designs, loading, error, updateName, updateQtyPlanned, updateShape, refetch: fetchDesigns }
}

/**
 * R19: проставить формы стикеров по номерам (design_index) после создания
 * заказа. Строки pack_designs создаёт триггер из stickers_per_pack — здесь
 * лишь патчим shape_type у спец-номеров. Пустой/standard пропускаем.
 * @param {string} orderId
 * @param {Array<{ design_index:number, shape:string }>} shapes
 */
export async function applyPackShapes(orderId, shapes) {
  if (!orderId || !Array.isArray(shapes) || shapes.length === 0) return
  const targets = shapes.filter((s) => s && s.shape && s.shape !== 'standard' && s.design_index > 0)
  const results = await Promise.allSettled(
    targets.map((s) =>
      supabase
        .from('k24_pack_designs')
        .update({ shape_type: s.shape })
        .eq('order_id', orderId)
        .eq('design_index', s.design_index)
        // Ревью 05.07: без .select() update по несуществующему design_index
        // трогает 0 строк и не считается ошибкой — форма «терялась» молча.
        .select('id')
    )
  )
  const failed = []
  results.forEach((r, i) => {
    if (r.status === 'rejected' || r.value?.error || !(r.value?.data?.length > 0)) {
      failed.push(targets[i].design_index)
    }
  })
  if (failed.length) throw new Error(`Не удалось сохранить форму стикеров №${failed.join(', ')} — проверьте номера видов`)
}
