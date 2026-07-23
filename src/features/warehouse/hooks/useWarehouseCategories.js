import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'

/**
 * R23.1 (ТЗ 23.07 Фаза 7) — категории склада из k24_warehouse_categories.
 * Один источник для формы материала, редактирования и фильтров (ТЗ 7.3:
 * добавленная в настройках категория сразу доступна везде).
 */
export function useWarehouseCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('k24_warehouse_categories')
      .select('id, name, sort_order')
      .order('sort_order')
      .order('name')
    if (error) captureError(error, { tags: { source: 'useWarehouseCategories' } })
    setCategories(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return { categories, loading, refetch: load }
}
