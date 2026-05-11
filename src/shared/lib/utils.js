import { format, formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

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

export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

// Отображаемый номер заказа: custom_number перекрывает числовой.
// «ORD-0123» по умолчанию, либо произвольный текст из k24_orders.custom_number.
export function formatOrderNumber(order) {
  const custom = order?.custom_number?.trim?.()
  if (custom) return custom
  return `ORD-${String(order?.number ?? 0).padStart(4, '0')}`
}

// Короткая форма для стикеров (без префикса ORD-).
export function formatOrderNumberShort(order) {
  const custom = order?.custom_number?.trim?.()
  if (custom) return custom
  return String(order?.number ?? 0).padStart(4, '0')
}

// Slug-safe для имён файлов экспорта (PDF/PNG).
export function orderFileSlug(order) {
  const raw = formatOrderNumber(order)
  return raw.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}
