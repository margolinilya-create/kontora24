import { format, formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ORDER_TYPES } from '@/shared/constants'
import { getTypeDef } from '@/shared/lib/route-registry'

export function formatDate(date) {
  if (!date) return '—'
  return format(new Date(date), 'd MMM yyyy', { locale: ru })
}

export function formatDateTime(date) {
  if (!date) return '—'
  return format(new Date(date), 'd MMM yyyy, HH:mm', { locale: ru })
}

export function formatRelative(date) {
  if (!date) return '—'
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ru })
}

export function formatPrice(amount) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(n, decimals = 2) {
  if (n == null) return '—'
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(n)
}

// Количество (метры / граммы / штуки) для отображения. Гасит float-шум
// накопленных сумм (59.30000000000900084 → «59,3») и добавляет разрядные
// пробелы. В отличие от formatNumber, null/NaN → «0» (для метрик пустота
// это ноль, а не прочерк). decimals=1 подходит метрам/граммам; для штук
// передавай decimals=0.
export function formatQty(n, decimals = 1) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0'
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(num)
}

export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

// Отображаемый номер заказа: custom_number перекрывает числовой.
// Без префиксов и padding — просто число (или произвольный текст из custom_number).
export function formatOrderNumber(order) {
  const custom = order?.custom_number?.trim?.()
  if (custom) return custom
  return String(order?.number ?? 0)
}

// Алиас для совместимости со старым кодом, который вызывал короткую форму
// для стикеров. Возвращает то же самое, что formatOrderNumber.
export function formatOrderNumberShort(order) {
  return formatOrderNumber(order)
}

// Slug-safe для имён файлов экспорта (PDF/PNG). Сохраняем ORD- префикс
// чтобы имена файлов оставались осмысленными (PDF/PNG-экспорт).
export function orderFileSlug(order) {
  const custom = order?.custom_number?.trim?.()
  const raw = custom || `ORD-${String(order?.number ?? 0).padStart(4, '0')}`
  return raw.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * R25.4 (ТЗ 4.1): подпись типа продукции заказа. Для «Прочее» (order_type
 * 'other') — название продукции (product_name), если задано. Принимает заказ
 * целиком; строка трактуется как order_type (совместимость со старыми
 * вызовами formatOrderType(type) из тех-карты и группировок по типу).
 */
export function formatOrderType(orderOrType) {
  const order = typeof orderOrType === 'string' || orderOrType == null
    ? { order_type: orderOrType }
    : orderOrType
  const type = order.order_type
  if (type === 'other') {
    const name = order.product_name?.trim?.()
    if (name) return name
  }
  if (!type) return '—'
  // R25.7A: название из реестра типов (k24_order_types), фолбэк — константы.
  return getTypeDef(type)?.name || ORDER_TYPES[type]?.label || type
}
