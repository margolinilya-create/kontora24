// R13.1 (бриф 02.06): план трат по складу — сумма прогноза forecastMaterials
// для всех активных заказов, у которых ещё нет фактических production_logs.
// Если в заказе хотя бы один лог с расходом материала (film_meters,
// lamination_meters, resin_grams) — заказ исключаем из плана (учитываем «уже
// тратят»).
//
// Возвращает Map<material_id, { planned: number, orders: [{ id, number, qty }] }>.
// Сопоставление выполняется через lookup от forecastMaterials:
//   { by: 'code', value: 'G' }      → material.material_code = 'G'
//   { by: 'type', value: 'packaging_bag' } → material.type = 'packaging_bag'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { forecastMaterials } from '@/features/orders/lib/material-forecast'

const ACTIVE_STATUSES = [
  'design', 'sample_layout', 'sample_print', 'color_approval', 'prepress',
  'print', 'lamination', 'cutting',
  'selection_pouring', 'pouring', 'drying', 'selection',
  'assembly_3d', 'packaging', 'otk',
]

export function usePlannedConsumption(materials) {
  const [plan, setPlan] = useState(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const compute = useCallback(async () => {
    if (!Array.isArray(materials) || materials.length === 0) {
      setPlan(new Map())
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [ordersRes, itemsRes, logsRes] = await Promise.all([
        supabase
          .from('k24_orders')
          .select('id, number, custom_number, order_type, qty, width_mm, height_mm, film_type, film_type_stickers, lam_type, bopp_bag, status')
          .in('status', ACTIVE_STATUSES),
        supabase
          .from('k24_order_items')
          .select('order_id, width_mm, height_mm, qty'),
        supabase
          .from('k24_production_logs')
          .select('order_id, film_meters, lamination_meters, resin_grams, qty_cut, lamination_qty')
          .is('deleted_at', null),
      ])
      if (ordersRes.error) throw ordersRes.error
      const orders = ordersRes.data || []
      const itemsByOrder = new Map()
      ;(itemsRes.data || []).forEach((it) => {
        const list = itemsByOrder.get(it.order_id) || []
        list.push({ widthMm: it.width_mm, heightMm: it.height_mm, qty: it.qty })
        itemsByOrder.set(it.order_id, list)
      })
      // Заказы у которых уже есть фактический расход — исключаем из плана.
      const ordersWithActual = new Set()
      ;(logsRes.data || []).forEach((l) => {
        const has = Number(l.film_meters) > 0
          || Number(l.lamination_meters) > 0
          || Number(l.resin_grams) > 0
          || Number(l.qty_cut) > 0
          || Number(l.lamination_qty) > 0
        if (has) ordersWithActual.add(l.order_id)
      })

      // Lookup: code → material, type → array of materials
      const byCode = new Map()
      const byType = new Map()
      for (const m of materials) {
        if (m.material_code) byCode.set(m.material_code, m)
        const list = byType.get(m.type) || []
        list.push(m)
        byType.set(m.type, list)
      }

      const result = new Map()
      for (const order of orders) {
        if (ordersWithActual.has(order.id)) continue
        const rows = forecastMaterials({
          orderType: order.order_type,
          widthMm: order.width_mm,
          heightMm: order.height_mm,
          qty: order.qty,
          filmType: order.film_type,
          filmTypeStickers: order.film_type_stickers,
          lamType: order.lam_type,
          boppBag: order.bopp_bag,
          items: itemsByOrder.get(order.id),
        })
        for (const row of rows) {
          if (!row.expected || row.expected <= 0 || !row.lookup) continue
          if (row.lookup.by === 'code') {
            const mat = byCode.get(row.lookup.value)
            if (!mat) continue
            const prev = result.get(mat.id) || { planned: 0, orders: [] }
            prev.planned += row.expected
            prev.orders.push({ id: order.id, number: order.number, custom_number: order.custom_number, qty: row.expected, unit: row.unit })
            result.set(mat.id, prev)
          } else if (row.lookup.by === 'type') {
            // Размазываем поровну между материалами этого типа (грубое
            // приближение — менеджер выберет конкретную позицию вручную).
            const matsOfType = byType.get(row.lookup.value) || []
            if (matsOfType.length === 0) continue
            const share = row.expected / matsOfType.length
            for (const mat of matsOfType) {
              const prev = result.get(mat.id) || { planned: 0, orders: [] }
              prev.planned += share
              prev.orders.push({ id: order.id, number: order.number, qty: share, unit: row.unit })
              result.set(mat.id, prev)
            }
          }
        }
      }
      setPlan(result)
    } catch (err) {
      captureError(err, { tags: { source: 'usePlannedConsumption' } })
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [materials])

  useEffect(() => { compute() }, [compute])

  return { plan, loading, error, refetch: compute }
}
