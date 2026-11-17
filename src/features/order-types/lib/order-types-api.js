import { supabase } from '@/shared/lib/supabase'

// R25.7C/D: запись реестра типов и каталога этапов — только через RPC
// (SECURITY DEFINER, право order_type:manage; миграции 102 / 104).
// Все RPC возвращают { ok, error? }: бизнес-отказ → Error с русским текстом.

async function callRpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  if (data && data.ok === false) throw new Error(data.error || 'Не удалось сохранить')
  return data
}

/** save_order_type(p jsonb) → { ok, type } */
export async function saveOrderType(payload) {
  const data = await callRpc('save_order_type', { p: payload })
  return data?.type || null
}

/** Число заказов по типам: { [type]: { total, active } } */
export async function fetchOrderTypeUsage() {
  const { data, error } = await supabase.rpc('order_type_usage')
  if (error) throw error
  const out = {}
  for (const r of data || []) out[r.order_type] = { total: Number(r.orders_count) || 0, active: Number(r.active_count) || 0 }
  return out
}

/** «Применить текущий маршрут типа» к заказу (admin/manager, аудит). */
export async function applyTypeRouteToOrder(orderId) {
  const data = await callRpc('apply_type_route_to_order', { p_order_id: orderId })
  return data?.route_snapshot || null
}

export async function createStageDef({ name, department, roles = [], norm = null, showInMenu = true, otkDefect = true }) {
  const data = await callRpc('create_stage_def', {
    p_name: name,
    p_department: department,
    p_roles: roles,
    p_norm: norm,
    p_show_in_menu: showInMenu,
    p_otk_defect: otkDefect,
  })
  return data?.stage || null
}

export async function updateStageDef(key, patch) {
  const data = await callRpc('update_stage_def', { p_key: key, p: patch })
  return data?.stage || null
}

export async function archiveStageDef(key, archived = true) {
  const data = await callRpc('archive_stage_def', { p_key: key, p_archived: archived })
  return data?.stage || null
}

export async function deleteStageDef(key) {
  await callRpc('delete_stage_def', { p_key: key })
}

/** Удалить свой тип без заказов (встроенный и использованный — отказ RPC). */
export async function deleteOrderType(key) {
  await callRpc('delete_order_type', { p_key: key })
}
