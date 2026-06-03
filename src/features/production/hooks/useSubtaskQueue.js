import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'

// Маппинг этапа очереди → допустимые subtask.status
const STAGE_TO_SUBTASK_STATUSES = {
  print: ['printing'],
  lamination: ['laminating'],
  cutting: ['cutting'],
  selection_pouring: ['selecting', 'pouring'],
  // R14.3 (бриф 03.06): подзадача в pouring должна видеться на отдельной
  // вкладке «Заливка», а не только в общем «Выборка/Заливка». Делаем sticker-
  // трек stickerpack3D видимым и там.
  pouring: ['pouring'],
}

/**
 * Загружает 3D-pack подзадачи для конкретного этапа очереди.
 * Каждый item: { order, track, subtask } — представляет одну параллельную
 * подзадачу. На странице очереди превращается в карточку с префиксом
 * «N-Фон»/«N-Стикер» (фидбэк менеджера 17.05).
 *
 * Если stage не из SUBTASK_ENABLED — возвращает пустой массив.
 */
export function useSubtaskQueue(stage) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const allowed = STAGE_TO_SUBTASK_STATUSES[stage]
    if (!allowed) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('k24_order_subtasks')
      .select('id, track, status, item_idx, order:k24_orders!order_id(*, client:k24_clients(name))')
      .in('status', allowed)
    if (error) {
      setItems([])
      setLoading(false)
      return
    }
    // R14.7 (code-review 03.06): extra_stickers подзадача может быть на ЛЮБОМ
    // типе заказа (sticker3D, sticker_cut и т.п.), не только stickerpack3D.
    // Раньше фильтр order_type === 'stickerpack3D' резал такие — допечатка
    // была невидима на /production/print, /production/cutting, /production/pouring.
    const list = (data || [])
      .filter((s) => s.order && (
        s.order.order_type === 'stickerpack3D' ||
        s.track === 'extra_stickers'
      ))
      .map((s) => ({
        order: s.order,
        track: s.track,
        subtask: { id: s.id, status: s.status, item_idx: s.item_idx },
      }))
    setItems(list)
    setLoading(false)
  }, [stage])

  useEffect(() => { fetchData() }, [fetchData])

  return { items, loading, refetch: fetchData }
}
