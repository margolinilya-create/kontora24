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
import { getActiveOrderStatuses } from '@/shared/constants'
import { fetchWarehouseCategories } from './useWarehouseCategories'
import { categoriesForField } from '../lib/order-material-categories'

/**
 * R25.7B (ТЗ 7.5): план трат дополнительных материалов = норма × тираж по
 * выбранной в заказе позиции (k24_order_materials). Позиция исключается из
 * плана, если по ней в заказе уже есть фактический расход (extra_consumption).
 * Отдельный блок с собственной обработкой ошибок: до миграции 105 таблицы и
 * колонки нет — основной план работает как раньше.
 */
async function addExtraMaterialsPlan(orders, materials, result) {
  const orderIds = orders.map((o) => o.id)
  if (orderIds.length === 0) return
  const categories = await fetchWarehouseCategories()
  const normByCat = new Map(
    categoriesForField(categories, 'extra')
      .filter((c) => Number(c.norm_per_item) > 0)
      .map((c) => [c.id, Number(c.norm_per_item)]),
  )
  if (normByCat.size === 0) return
  const [omRes, logsRes] = await Promise.all([
    supabase.from('k24_order_materials').select('order_id, category_id, material_id').in('order_id', orderIds),
    supabase.from('k24_production_logs').select('order_id, extra_consumption').in('order_id', orderIds).is('deleted_at', null),
  ])
  if (omRes.error) throw omRes.error
  if (logsRes.error) throw logsRes.error
  const consumed = new Set()
  for (const l of logsRes.data || []) {
    for (const [mid, q] of Object.entries(l.extra_consumption || {})) {
      if (Number(q) > 0) consumed.add(`${l.order_id}:${mid}`)
    }
  }
  const orderById = new Map(orders.map((o) => [o.id, o]))
  for (const row of omRes.data || []) {
    const norm = normByCat.get(row.category_id)
    const order = orderById.get(row.order_id)
    if (!norm || !order || consumed.has(`${row.order_id}:${row.material_id}`)) continue
    const mat = materials.find((m) => m.id === row.material_id)
    const expected = norm * (Number(order.qty) || 0)
    if (!mat || !(expected > 0)) continue
    const prev = result.get(mat.id) || { planned: 0, orders: [] }
    prev.planned += expected
    prev.orders.push({ id: order.id, number: order.number, custom_number: order.custom_number, qty: expected, unit: mat.unit })
    result.set(mat.id, prev)
  }
}

// R25.1: из общего списка активных статусов. Не входят: «Новый заказ» и
// «Ждёт оплаты» (заказ ещё не запущен) и «Субподряд» (цех не расходует материалы).
const activeStatuses = () => getActiveOrderStatuses().filter((s) => !['new', 'awaiting_payment', 'subcontract'].includes(s))

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
          .select('id, number, custom_number, order_type, qty, width_mm, height_mm, film_type, film_type_stickers, lam_type, bopp_bag, status, needs_montage_film, montage_material_id, is_subcontract')
          .in('status', activeStatuses()),
        supabase
          .from('k24_order_items')
          .select('order_id, width_mm, height_mm, qty'),
        supabase
          .from('k24_production_logs')
          .select('order_id, film_meters, lamination_meters, montage_meters, resin_grams, qty_cut, lamination_qty')
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
          || Number(l.montage_meters) > 0
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
          // R25.4: монтажная плёнка — отдельная строка; субподряд — без плана.
          needsMontageFilm: !!order.needs_montage_film,
          montageMaterialId: order.montage_material_id,
          isSubcontract: !!order.is_subcontract,
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
          } else if (row.lookup.by === 'materialId') {
            const mat = materials.find((m) => m.id === row.lookup.value)
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
      const extraOrders = orders.filter((o) => !o.is_subcontract)
      try {
        await addExtraMaterialsPlan(extraOrders, materials, result)
      } catch (extraErr) {
        captureError(extraErr, { tags: { source: 'usePlannedConsumption.extra' } })
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
