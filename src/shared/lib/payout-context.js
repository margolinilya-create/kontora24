import { supabase } from './supabase'

/**
 * R19: контекст для дифференцированной оплаты заливки по форме стикера.
 *
 * Форма стикера хранится в:
 *   • k24_pack_designs.shape_type — по design_index (номер стикера в паке /
 *     дизайн-вид sticker3D);
 *   • k24_orders.sticker_shape — order-level для одиночного sticker3D.
 *
 * Лог заливки несёт design_index (для паков / multi-view) либо ничего
 * (одиночный sticker3D). Соответственно оплата ищется:
 *   shapeByDesign[`${order_id}:${design_index}`] → orderShape[order_id] → 'standard'.
 */

/**
 * Забрать non-standard формы pack_designs для набора заказов.
 * @returns {Promise<Object>} { `${order_id}:${design_index}`: shape }
 */
export async function fetchShapeByDesign(orderIds) {
  const ids = [...new Set((orderIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const { data, error } = await supabase
    .from('k24_pack_designs')
    .select('order_id, design_index, shape_type')
    .in('order_id', ids)
    .neq('shape_type', 'standard')
  if (error) throw error
  const map = {}
  for (const d of data || []) map[`${d.order_id}:${d.design_index}`] = d.shape_type
  return map
}

/**
 * Построить { [order_id]: shape } из логов, чей order-embed несёт sticker_shape.
 * (standard опускаем — дефолт всё равно standard.)
 */
export function orderShapeFromLogs(logs) {
  const map = {}
  for (const l of logs || []) {
    const s = l.order?.sticker_shape
    if (s && s !== 'standard' && l.order_id) map[l.order_id] = s
  }
  return map
}

/** Форма конкретного лога заливки по картам shapeByDesign/orderShape. */
export function shapeForLog(log, shapeByDesign, orderShape) {
  return (
    shapeByDesign?.[`${log.order_id}:${log.design_index}`] ||
    orderShape?.[log.order_id] ||
    (log.order?.sticker_shape && log.order.sticker_shape !== 'standard' ? log.order.sticker_shape : null) ||
    'standard'
  )
}

/** Ставка заливки для формы из bonus_rates ({ pouring, pouring_shapes }). */
export function pouringRateForShape(shape, bonusRates) {
  const byShape = bonusRates?.pouring_shapes
  if (byShape && byShape[shape] != null) return Number(byShape[shape])
  return Number(bonusRates?.pouring) || 0
}
