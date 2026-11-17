import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { fetchAllRows } from '@/shared/lib/fetch-all'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

/**
 * R25.8: позиции склада читаются через view k24_materials_full — средняя цена
 * (unit_cost) приходит NULL без права view:finance. После миграции 098 прямой
 * SELECT k24_materials.unit_cost у authenticated отозван, поэтому select('*')
 * по таблице запрещён: только явные колонки или это view.
 */
export const MATERIAL_COLS = [
  'id', 'type', 'name', 'stock_qty', 'unit', 'min_qty', 'unit_cost', 'updated_at', 'material_code',
  'capacity_per_box', 'archived_at', 'width_mm', 'height_mm', 'manufacturer', 'product_line',
  'roll_width_m', 'finish', 'color', 'supplier', 'category_id', 'wh_status_id', 'category_name',
].join(', ')

/** Колонки таблицы k24_materials без денег — для returning после insert/update. */
export const MATERIAL_TABLE_COLS = [
  'id', 'type', 'name', 'stock_qty', 'unit', 'min_qty', 'updated_at', 'material_code',
  'capacity_per_box', 'archived_at', 'width_mm', 'height_mm', 'manufacturer', 'product_line',
  'roll_width_m', 'finish', 'color', 'supplier', 'category_id', 'wh_status_id',
].join(', ')

/** Строка view → форма, к которой привыкли компоненты (category.name). */
export function normalizeMaterialRow(m) {
  if (!m) return m
  return { ...m, category: m.category_name ? { name: m.category_name } : null }
}

/**
 * @param {{ includeArchived?: boolean }} [opts]
 *   includeArchived — если true, возвращает архивные позиции вместе с активными
 *   (для UI «показать архив»). По умолчанию активные.
 */
export function useMaterials(opts = {}) {
  const { includeArchived = false } = opts
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reservationsError, setReservationsError] = useState(null)

  const fetchMaterials = useCallback(async () => {
    setLoading(true)
    setError(null)
    setReservationsError(null)
    let data, reservations
    try {
      let materialsQuery = supabase
        .from('k24_materials_full')
        .select(MATERIAL_COLS)
        .order('type', { ascending: true })
      if (!includeArchived) {
        materialsQuery = materialsQuery.is('archived_at', null)
      }
      const results = await Promise.all([
        materialsQuery,
        // Порциями (PostgREST режет ответ до 1000 строк). Ошибку резервов
        // не глотаем молча (код-ревью 17.11): остатки показываем, но «Доступно»
        // без учёта резерва помечаем и сообщаем пользователю.
        fetchAllRows(() => supabase
          .from('k24_material_transactions')
          .select('id, material_id, delta')
          .eq('reservation_status', 'reserved')
          .order('id'))
          .then((rows) => ({ data: rows, error: null }), (err) => ({ data: null, error: err })),
      ])
      data = results[0].data
      reservations = results[1].data
      if (results[0].error) throw results[0].error
      if (results[1].error) {
        captureError(results[1].error, { tags: { source: 'warehouse.useMaterials.reservations' } })
        setReservationsError(results[1].error)
        toast.error(`Не удалось загрузить резервы — «Доступно» показано без учёта резерва. ${translateError(results[1].error).message}`)
      }
    } catch (err) {
      setError(err)
      setLoading(false)
      return
    }

    // Sum reserved amounts per material
    const reservedByMaterial = {}
    ;(reservations || []).forEach(r => {
      reservedByMaterial[r.material_id] = (reservedByMaterial[r.material_id] || 0) + Math.abs(Number(r.delta))
    })

    const materialsWithReservations = (data || []).map(normalizeMaterialRow).map(m => ({
      ...m,
      reserved: reservedByMaterial[m.id] || 0,
      available: Math.max(0, Number(m.stock_qty) - (reservedByMaterial[m.id] || 0)),
    }))

    setMaterials(materialsWithReservations)
    setLoading(false)
    // R20.0 (бриф 3.07, «висячий баг»): includeArchived в deps — иначе stale-closure,
    // чекбокс «Показать архив» не перезапрашивал список.
  }, [includeArchived])

  useEffect(() => { fetchMaterials() }, [fetchMaterials])
  useRefetchOnFocus(fetchMaterials)

  return { materials, loading, error, reservationsError, refetch: fetchMaterials }
}

/**
 * Архивация: помечает позицию как скрытую, исторические транзакции и
 * unit_cost сохраняются. Реверс — через unarchiveMaterial.
 */
export async function archiveMaterial(id) {
  if (!id) throw new Error('archiveMaterial: нужен id')
  const { error } = await supabase
    .from('k24_materials')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function unarchiveMaterial(id) {
  if (!id) throw new Error('unarchiveMaterial: нужен id')
  const { error } = await supabase
    .from('k24_materials')
    .update({ archived_at: null })
    .eq('id', id)
  if (error) throw error
}

/**
 * Полное удаление позиции (hard delete).
 * Перед DELETE проверяем что нет связанных транзакций — если есть,
 * бросаем ошибку с подсказкой архивировать. Это защита от удаления позиции
 * с историей расходов (она нужна для отчётов).
 */
export async function deleteMaterial(id) {
  if (!id) throw new Error('deleteMaterial: нужен id')
  const { count: txCount, error: countError } = await supabase
    .from('k24_material_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('material_id', id)
  if (countError) throw countError
  if ((txCount || 0) > 0) {
    const err = new Error(`У позиции ${txCount} транзакций — её можно только архивировать`)
    err.code = 'HAS_TRANSACTIONS'
    err.count = txCount
    throw err
  }
  const { error } = await supabase
    .from('k24_materials')
    .delete()
    .eq('id', id)
  if (error) throw error
}

/**
 * R25.8: операция склада через RPC warehouse_add_operation (миграция 096) —
 * запись операции и изменение остатка в одной транзакции. Каждое место записи
 * передаёт вид операции явно.
 *
 * @param {object} p
 * @param {string} p.materialId
 * @param {number} p.delta — знак: + приход/начальный остаток, − расход
 * @param {'purchase'|'manual_consumption'|'opening'} p.kind
 * @param {string} [p.reason] — комментарий (для расхода обязателен)
 * @param {string} [p.orderId]
 * @param {number|string} [p.totalCost] — сумма по накладной, только у прихода
 * @param {string} [p.opDate] — 'YYYY-MM-DD', не позже сегодня (по умолчанию сегодня)
 * @param {string} [p.supplier]
 * @param {string} [p.docNumber]
 * @returns {Promise<string>} id операции
 */
export async function addMaterialTransaction({
  materialId, delta, kind, reason, orderId, totalCost, opDate, supplier, docNumber,
}) {
  if (!kind) throw new Error('addMaterialTransaction: нужен вид операции (kind)')
  const totalCostValue = kind === 'purchase' && totalCost !== undefined && totalCost !== null && totalCost !== ''
    ? Number(totalCost)
    : null
  const { data, error } = await supabase.rpc('warehouse_add_operation', {
    p_material_id: materialId,
    p_delta: Number(delta),
    p_kind: kind,
    p_reason: reason || null,
    p_order_id: orderId || null,
    p_total_cost: totalCostValue,
    p_op_date: opDate || null,
    p_supplier: supplier || null,
    p_doc_number: docNumber || null,
  })
  if (error) throw error
  return data
}

/**
 * Массовая инвентаризация одной транзакцией (RPC warehouse_inventory):
 * delta = факт − текущий остаток (берётся на сервере под блокировкой),
 * нулевые расхождения пропускаются, вид операции — «Инвентаризация».
 *
 * @param {Array<{ materialId: string, factualQty: number }>} items
 * @returns {Promise<{ updated: number, skipped: number }>}
 */
export async function bulkInventory(items) {
  const payload = []
  let skipped = 0
  for (const item of items) {
    const fact = Number(item.factualQty)
    if (item.factualQty === '' || item.factualQty == null || isNaN(fact) || fact < 0) { skipped++; continue }
    payload.push({ material_id: item.materialId, fact })
  }
  if (payload.length === 0) return { updated: 0, skipped }
  const { data, error } = await supabase.rpc('warehouse_inventory', { p_items: payload })
  if (error) throw error
  return { updated: Number(data?.updated) || 0, skipped: skipped + (Number(data?.skipped) || 0) }
}

/**
 * Точечное обновление позиции склада. Поле name можно править при наличии
 * права material:edit_name (RLS политика k24_materials_update_name).
 */
export async function updateMaterial(id, fields) {
  if (!id || !fields || typeof fields !== 'object') {
    throw new Error('updateMaterial: нужен id и объект изменений')
  }
  const { data, error } = await supabase
    .from('k24_materials')
    .update(fields)
    .eq('id', id)
    .select(MATERIAL_TABLE_COLS)
    .single()
  if (error) throw error
  return data
}

export async function createMaterial({
  type, name, unit, stockQty, minQty, unitCost, supplier, categoryId,
  // Структурные поля плёнки/ламинации (05.07) — опциональны для прочих типов.
  manufacturer, product_line, roll_width_m, finish, color,
}) {
  const { data, error } = await supabase
    .from('k24_materials')
    .insert({
      type,
      name,
      unit,
      category_id: categoryId ?? null,
      // R25.8: остаток не пишем напрямую — его создаёт операция «Начальный
      // остаток» ниже, чтобы история объясняла каждый метр.
      stock_qty: 0,
      min_qty: minQty || 0,
      unit_cost: unitCost || 0,
      supplier: supplier ?? null,
      manufacturer: manufacturer ?? null,
      product_line: product_line ?? null,
      roll_width_m: roll_width_m ?? null,
      finish: finish ?? null,
      color: color ?? null,
    })
    .select(MATERIAL_TABLE_COLS)
    .single()

  if (error) throw error

  const initial = Number(stockQty) || 0
  if (initial !== 0) {
    try {
      await addMaterialTransaction({
        materialId: data.id,
        delta: initial,
        kind: 'opening',
        reason: 'Начальный остаток',
      })
    } catch (err) {
      captureError(err, { tags: { source: 'createMaterial.opening' }, extra: { materialId: data.id } })
      const e = new Error('Позиция создана, но начальный остаток не записан — внесите его приходом')
      e.cause = err
      throw e
    }
    return { ...data, stock_qty: initial }
  }
  return data
}
