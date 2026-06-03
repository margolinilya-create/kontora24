import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'

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

  const fetchMaterials = useCallback(async () => {
    setLoading(true)
    setError(null)
    let data, reservations
    try {
      let materialsQuery = supabase
        .from('k24_materials')
        .select('*')
        .order('type', { ascending: true })
      if (!includeArchived) {
        materialsQuery = materialsQuery.is('archived_at', null)
      }
      const results = await Promise.all([
        materialsQuery,
        supabase
          .from('k24_material_transactions')
          .select('material_id, delta')
          .eq('reservation_status', 'reserved'),
      ])
      data = results[0].data
      reservations = results[1].data
      if (results[0].error) throw results[0].error
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

    const materialsWithReservations = (data || []).map(m => ({
      ...m,
      reserved: reservedByMaterial[m.id] || 0,
      available: Math.max(0, Number(m.stock_qty) - (reservedByMaterial[m.id] || 0)),
    }))

    setMaterials(materialsWithReservations)
    setLoading(false)
  }, [])

  useEffect(() => { fetchMaterials() }, [fetchMaterials])
  useRefetchOnFocus(fetchMaterials)

  return { materials, loading, error, refetch: fetchMaterials }
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
    .select('*', { count: 'exact', head: true })
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

export function useMaterialTransactions(materialId) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!materialId) return
    async function fetch() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: err } = await supabase
          .from('k24_material_transactions')
          .select('*, material:k24_materials(name), created_by_profile:k24_profiles!created_by(display_name)')
          .eq('material_id', materialId)
          .order('created_at', { ascending: false })
          .limit(50)
        if (err) throw err
        setTransactions(data || [])
      } catch (err) {
        captureError(err, { tags: { source: 'useMaterialTransactions.fetch' }, extra: { materialId } })
        setError(err)
        setTransactions([])
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [materialId])

  return { transactions, loading, error }
}

export async function addMaterialTransaction({ materialId, delta, reason, orderId, totalCost }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // totalCost: только на приходе. Триггер recalc_material_wac (migration 036)
  // обновит k24_materials.unit_cost через weighted-average и заполнит NEW.unit_cost.
  const totalCostValue = delta > 0 && totalCost !== undefined && totalCost !== null && totalCost !== ''
    ? Number(totalCost)
    : null

  const { data: txn, error } = await supabase.from('k24_material_transactions').insert({
    material_id: materialId,
    delta,
    reason,
    order_id: orderId || null,
    created_by: user.id,
    total_cost: totalCostValue,
  }).select('id').single()
  if (error) throw error

  // Atomic stock update via RPC — rollback transaction record on failure
  const { error: rpcError } = await supabase.rpc('update_stock', {
    p_material_id: materialId,
    p_delta: delta,
  })
  if (rpcError) {
    // Rollback: delete the orphan transaction record
    await supabase.from('k24_material_transactions').delete().eq('id', txn.id)
    throw rpcError
  }
}

/**
 * Массовая инвентаризация: для каждого материала устанавливаем фактический остаток.
 * Для каждой записи создаётся material_transaction с дельтой (factual - current)
 * и reason='Инвентаризация'. Если delta=0 — пропускаем (не пишем нулевую транзакцию).
 *
 * @param {Array<{ materialId: string, currentQty: number, factualQty: number }>} items
 * @returns {Promise<{ updated: number, skipped: number }>}
 */
export async function bulkInventory(items) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  let updated = 0, skipped = 0
  for (const item of items) {
    const fact = Number(item.factualQty)
    const current = Number(item.currentQty) || 0
    if (isNaN(fact) || fact < 0) { skipped++; continue }
    const delta = fact - current
    if (Math.abs(delta) < 0.0001) { skipped++; continue }

    await addMaterialTransaction({
      materialId: item.materialId,
      delta,
      reason: 'Инвентаризация',
    })
    updated++
  }
  return { updated, skipped }
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
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createMaterial({ type, name, unit, stockQty, minQty, unitCost }) {
  const { data, error } = await supabase
    .from('k24_materials')
    .insert({
      type,
      name,
      unit,
      stock_qty: stockQty || 0,
      min_qty: minQty || 0,
      unit_cost: unitCost || 0,
    })
    .select()
    .single()

  if (error) throw error
  return data
}
