import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { CATEGORY_COLS } from '../lib/order-material-categories'

const BASE_COLS = 'id, name, sort_order'

/**
 * Категории склада. R25.7B: с отметками для заказа (миграция 105). Пока 105
 * не применена, запрос новых колонок падает 42703 — читаем базовые колонки
 * (отметок нет → формы работают по служебному типу позиции, как раньше).
 */
export async function fetchWarehouseCategories() {
  let res = await supabase
    .from('k24_warehouse_categories')
    .select(CATEGORY_COLS)
    .order('sort_order')
    .order('name')
  if (res.error?.code === '42703') {
    res = await supabase
      .from('k24_warehouse_categories')
      .select(BASE_COLS)
      .order('sort_order')
      .order('name')
  }
  if (res.error) throw res.error
  return res.data || []
}

/**
 * R23.1 (ТЗ 23.07 Фаза 7) — категории склада из k24_warehouse_categories.
 * Один источник для формы материала, редактирования и фильтров (ТЗ 7.3:
 * добавленная в настройках категория сразу доступна везде).
 */
export function useWarehouseCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setCategories(await fetchWarehouseCategories())
    } catch (error) {
      captureError(error, { tags: { source: 'useWarehouseCategories' } })
      setCategories([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { categories, loading, refetch: load }
}
