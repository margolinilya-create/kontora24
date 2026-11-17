import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { fetchWarehouseCategories } from '@/features/warehouse/hooks/useWarehouseCategories'
import { fetchOrderMaterials } from '@/features/orders/hooks/useOrderMaterials'
import { categoriesForField, extraConsumptionFields } from '@/features/warehouse/lib/order-material-categories'

/**
 * R25.7B (ТЗ 7.5): поля «Расход: <категория>» для формы учёта этапа stage —
 * доп. материалы заказа, чья категория списывается на этом этапе.
 * Пустой массив, если у заказа нет таких материалов (форма не меняется).
 */
export function useExtraConsumptionFields(orderId, stage) {
  const [fields, setFields] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!orderId || !stage) { setFields([]); return }
      try {
        const categories = await fetchWarehouseCategories()
        const onStage = categoriesForField(categories, 'extra').filter((c) => c.consume_stage === stage)
        if (onStage.length === 0) { if (!cancelled) setFields([]); return }
        const rows = await fetchOrderMaterials(orderId)
        const ids = [...new Set(rows.map((r) => r.material_id))]
        let materials = []
        if (ids.length > 0) {
          const { data, error } = await supabase
            .from('k24_materials_full')
            .select('id, name, unit')
            .in('id', ids)
          if (error) throw error
          materials = data || []
        }
        if (!cancelled) setFields(extraConsumptionFields(categories, rows, stage, materials))
      } catch (err) {
        captureError(err, { tags: { source: 'useExtraConsumptionFields' }, extra: { orderId, stage } })
        if (!cancelled) setFields([])
      }
    }
    load()
    return () => { cancelled = true }
  }, [orderId, stage])

  return fields
}
