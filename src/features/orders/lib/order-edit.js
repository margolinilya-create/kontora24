import { getOrderRoute, getStatusMeta } from '@/shared/constants'

/**
 * Ревью R25 — чистая логика редактора заказа (AdminOrderEditor) и мержа
 * сохранённого патча на странице заказа (OrderDetailPage).
 */

function isPositiveNumber(v, { integer = false } = {}) {
  if (v === '' || v == null) return false
  const n = Number(v)
  if (!Number.isFinite(n) || n < 1) return false
  return integer ? Number.isInteger(n) : true
}

/**
 * Проверка тиража и размера (п.6). Возвращает текст ошибки или null.
 * @param {{ qty:any, width_mm:any, height_mm:any }} form
 */
export function validateOrderSize(form) {
  if (!isPositiveNumber(form?.qty, { integer: true })) return 'Тираж — целое число не меньше 1'
  if (!isPositiveNumber(form?.width_mm)) return 'Ширина — не меньше 1 мм'
  if (!isPositiveNumber(form?.height_mm)) return 'Длина — не меньше 1 мм'
  return null
}

/**
 * Параметры updateOrderStatus для ручной смены статуса из редактора (п.1).
 * Назад по маршруту — откат; вперёд/вне маршрута — принудительный переход
 * с пометкой «пропущен вручную».
 *
 * @param {object} order — заказ с уже сохранёнными полями маршрута
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {{ isRollback?: boolean, force?: boolean, kind: string, note?: string }}
 */
export function planManualStatusChange(order, fromStatus, toStatus) {
  const route = getOrderRoute(order)
  const fromIdx = route.indexOf(fromStatus)
  const toIdx = route.indexOf(toStatus)
  if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) {
    return { isRollback: true, kind: 'rollback' }
  }
  const skipped = fromIdx >= 0 && toIdx > fromIdx ? route.slice(fromIdx + 1, toIdx) : []
  const note = skipped.length > 0
    ? `Пропущен вручную: ${skipped.map((s) => getStatusMeta(s)?.label || s).join(', ')}`
    : 'Статус изменён вручную в редакторе'
  return { force: true, kind: 'manual_skip', note }
}

// Поля, от которых зависит маршрут (триггер БД пересобирает route_snapshot)
// и производные данные страницы — после их смены нужен полный refetch.
export const ROUTE_AFFECTING_FIELDS = [
  'order_type', 'route_version', 'is_subcontract', 'needs_montage_film',
  'need_lam', 'delivery_type', 'design_status', 'bopp_bag', 'status',
]

/**
 * Нужен ли refetch после сохранения редактора (п.5): изменилось хоть одно
 * поле маршрута — локального мержа патча недостаточно.
 */
export function patchNeedsRefetch(prev, patch) {
  if (!patch) return true
  if (!prev) return true
  return ROUTE_AFFECTING_FIELDS.some((k) => k in patch && patch[k] !== prev[k])
}

/** Ревью R25 (12a): следующий этап после color_approval по маршруту заказа. */
export function getColorApprovalNext(order) {
  const route = getOrderRoute(order)
  const idx = route.indexOf('color_approval')
  return idx >= 0 ? route[idx + 1] || null : null
}
