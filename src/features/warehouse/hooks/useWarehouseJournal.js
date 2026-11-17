import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { fetchAllChunked } from '@/shared/lib/export-xlsx'
import { JOURNAL_SORTS, EXPORT_CHUNK, EXPORT_CAP } from '../lib/warehouse-journal'

/**
 * R25.8 — журнал склада. Все чтения идут через RPC warehouse_movements
 * (миграция 096): один набор серверных фильтров для списка, итогов и Excel.
 * Денежные поля приходят NULL без права view:finance (маска во view).
 */
export const MOVEMENT_COLS = [
  'id', 'material_id', 'material_name', 'unit', 'material_type', 'category_id', 'category_name',
  'material_archived', 'kind', 'is_auto', 'needs_review', 'op_date', 'created_at', 'delta', 'reason',
  'supplier', 'doc_number', 'order_id', 'order_number', 'order_custom_number', 'created_by',
  'created_by_name', 'updated_by', 'updated_at', 'total_cost', 'unit_cost', 'balance_after',
].join(', ')

export const JOURNAL_PAGE_SIZE = 100

function movementsQuery(rpcFilters, sortKey, withCount) {
  let q = supabase
    .rpc('warehouse_movements', { p_filters: rpcFilters }, withCount ? { count: 'exact' } : undefined)
    .select(MOVEMENT_COLS)
  for (const [col, asc] of JOURNAL_SORTS[sortKey] || JOURNAL_SORTS.date_desc) {
    q = q.order(col, { ascending: asc, nullsFirst: false })
  }
  return q
}

/**
 * Список операций с догрузкой по pageSize. При смене фильтра/сортировки
 * список начинается заново; ответы устаревших запросов отбрасываются.
 */
export function useMovementsList(rpcFilters, sortKey = 'date_desc', { pageSize = JOURNAL_PAGE_SIZE, enabled = true } = {}) {
  const key = JSON.stringify([rpcFilters, sortKey])
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const reqRef = useRef(0)
  const rowsRef = useRef([])

  const loadPage = useCallback(async (append) => {
    const req = ++reqRef.current
    if (append) setLoadingMore(true)
    else { setLoading(true); setError(null) }
    const offset = append ? rowsRef.current.length : 0
    try {
      const [f, s] = JSON.parse(key)
      const { data, error: err, count } = await movementsQuery(f, s, !append).range(offset, offset + pageSize - 1)
      if (err) throw err
      if (req !== reqRef.current) return
      const next = append ? [...rowsRef.current, ...(data || [])] : (data || [])
      rowsRef.current = next
      setRows(next)
      if (!append) setTotal(count ?? next.length)
    } catch (err) {
      if (req !== reqRef.current) return
      captureError(err, { tags: { source: 'useMovementsList.load' } })
      setError(err)
    } finally {
      if (req === reqRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [key, pageSize])

  useEffect(() => {
    if (!enabled) return
    rowsRef.current = []
    setRows([])
    setTotal(null)
    loadPage(false)
  }, [loadPage, enabled])

  const hasMore = total != null && rows.length < total
  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return
    loadPage(true)
  }, [loading, loadingMore, hasMore, loadPage])

  return { rows, total, loading, loadingMore, error, hasMore, loadMore, reload: () => loadPage(false) }
}

/** Итоги по всему фильтру (RPC warehouse_movements_totals). */
export function useMovementsTotals(rpcFilters, { enabled = true } = {}) {
  const key = JSON.stringify(rpcFilters)
  const [totals, setTotals] = useState(null)
  const [error, setError] = useState(null)
  const reqRef = useRef(0)

  const load = useCallback(async () => {
    const req = ++reqRef.current
    setError(null)
    const { data, error: err } = await supabase.rpc('warehouse_movements_totals', { p_filters: JSON.parse(key) })
    if (req !== reqRef.current) return
    if (err) {
      captureError(err, { tags: { source: 'useMovementsTotals.load' } })
      setError(err)
      setTotals(null)
      return
    }
    setTotals(Array.isArray(data) ? data[0] || null : data)
  }, [key])

  useEffect(() => { if (enabled) load() }, [load, enabled])

  return { totals, error, reload: load }
}

/** Все строки фильтра порциями по 1000 (для Excel), предел 50 000. */
export async function fetchAllMovements(rpcFilters, sortKey, { total, onProgress } = {}) {
  return fetchAllChunked(async (from, to) => {
    const { data, error } = await movementsQuery(rpcFilters, sortKey, false).range(from, to)
    if (error) throw error
    return data || []
  }, { total, chunk: EXPORT_CHUNK, cap: EXPORT_CAP, onProgress })
}

/** Оборотная ведомость за период (RPC warehouse_turnover). */
export function useTurnover(from, to, categoryIds) {
  const key = JSON.stringify([from, to, categoryIds || []])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const reqRef = useRef(0)

  const load = useCallback(async () => {
    const [f, t, cats] = JSON.parse(key)
    if (!f || !t) { setRows([]); setLoading(false); return }
    const req = ++reqRef.current
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('warehouse_turnover', {
      p_from: f, p_to: t, p_category_ids: cats.length ? cats : null,
    })
    if (req !== reqRef.current) return
    if (err) {
      captureError(err, { tags: { source: 'useTurnover.load' } })
      setError(err)
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }, [key])

  useEffect(() => { load() }, [load])

  return { rows, loading, error, reload: load }
}

/** Справочники для фильтров журнала: позиции (вкл. архив) и сотрудники. */
export function useJournalLookups() {
  const [materials, setMaterials] = useState([])
  const [users, setUsers] = useState([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('k24_materials_full').select('id, name, unit, category_id, archived_at, supplier').order('name'),
      supabase.from('k24_profiles').select('id, display_name').order('display_name'),
    ]).then(([m, u]) => {
      if (cancelled) return
      if (m.error) captureError(m.error, { tags: { source: 'useJournalLookups.materials' } })
      if (u.error) captureError(u.error, { tags: { source: 'useJournalLookups.users' } })
      setMaterials(m.data || [])
      setUsers(u.data || [])
    })
    return () => { cancelled = true }
  }, [])

  return { materials, users }
}

/** Ранее введённые поставщики — подсказки в форме прихода. */
export function useSupplierSuggestions(enabled = true) {
  const [suppliers, setSuppliers] = useState([])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    Promise.all([
      supabase.from('k24_material_transactions').select('supplier').not('supplier', 'is', null).limit(1000),
      supabase.from('k24_materials').select('supplier').not('supplier', 'is', null),
    ]).then(([t, m]) => {
      if (cancelled) return
      const set = new Set()
      for (const r of [...(t.data || []), ...(m.data || [])]) {
        const s = String(r.supplier || '').trim()
        if (s) set.add(s)
      }
      setSuppliers([...set].sort((a, b) => a.localeCompare(b, 'ru')))
    })
    return () => { cancelled = true }
  }, [enabled])
  return suppliers
}

/** «Уточнить» — RPC update_material_operation (право warehouse:edit_operation). */
export async function updateMaterialOperation({ id, opDate, kind, supplier, docNumber, reason }) {
  const { error } = await supabase.rpc('update_material_operation', {
    p_id: id,
    p_op_date: opDate,
    p_kind: kind,
    p_supplier: supplier || null,
    p_doc_number: docNumber || null,
    p_reason: reason || null,
  })
  if (error) throw error
}

/** Аудит уточнений операции. */
export async function fetchOperationAudit(transactionId) {
  const { data, error } = await supabase
    .from('k24_material_transaction_audit')
    .select('id, field_name, old_value, new_value, changed_at, changed_by_profile:k24_profiles!changed_by(display_name)')
    .eq('transaction_id', transactionId)
    .order('changed_at', { ascending: false })
  if (error) throw error
  return data || []
}
