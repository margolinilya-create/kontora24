import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'

// R25.4 (ТЗ 4.2): справочник подрядчиков k24_contractors (миграция 099).
// Чтение — всем authenticated; запись — по праву contractor:manage (RLS).
export const CONTRACTOR_COLS = 'id, name, specialization, contact_person, phone, contact, notes, archived_at, created_at'

/** Ошибка: подрядчика с заказами удалить нельзя — только архив. */
export const CONTRACTOR_HAS_ORDERS = 'CONTRACTOR_HAS_ORDERS'

/**
 * @param {{ includeArchived?: boolean }} [opts]
 * @returns {{ contractors: object[], loading: boolean, error: Error|null, refetch: () => Promise<void> }}
 */
export function useContractors({ includeArchived = false } = {}) {
  const [contractors, setContractors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    let q = supabase.from('k24_contractors').select(CONTRACTOR_COLS).order('name')
    if (!includeArchived) q = q.is('archived_at', null)
    const { data, error: err } = await q
    if (err) {
      captureError(err, { tags: { source: 'useContractors.load' } })
      setError(err)
    } else {
      setContractors(data || [])
    }
    setLoading(false)
  }, [includeArchived])

  useEffect(() => { refetch() }, [refetch])

  return { contractors, loading, error, refetch }
}

/** Нормализация полей формы: пустые строки → null, название обрезано. */
export function normalizeContractor(values) {
  const clean = (v) => {
    const t = (v ?? '').toString().trim()
    return t ? t : null
  }
  return {
    name: (values.name ?? '').toString().trim(),
    specialization: clean(values.specialization),
    contact_person: clean(values.contact_person),
    phone: clean(values.phone),
    contact: clean(values.contact),
    notes: clean(values.notes),
  }
}

export async function saveContractor(id, values) {
  const payload = normalizeContractor(values)
  if (!payload.name) throw new Error('Укажите название подрядчика')
  if (id) {
    const { error } = await supabase
      .from('k24_contractors')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('k24_contractors').insert(payload)
  if (error) throw error
}

export async function setContractorArchived(id, archived) {
  const { error } = await supabase
    .from('k24_contractors')
    .update({ archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/**
 * Удаление — только подрядчика без заказов (ТЗ 4.2). Предпроверка по
 * k24_orders + серверная страховка FK ON DELETE RESTRICT (23503).
 */
export async function deleteContractor(id) {
  const { count, error: cntErr } = await supabase
    .from('k24_orders')
    .select('id', { count: 'exact', head: true })
    .eq('contractor_id', id)
  if (cntErr) throw cntErr
  if ((count || 0) > 0) {
    const e = new Error('У подрядчика есть заказы — его можно только архивировать')
    e.code = CONTRACTOR_HAS_ORDERS
    throw e
  }
  const { error } = await supabase.from('k24_contractors').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      const e = new Error('У подрядчика есть заказы — его можно только архивировать')
      e.code = CONTRACTOR_HAS_ORDERS
      throw e
    }
    throw error
  }
}
