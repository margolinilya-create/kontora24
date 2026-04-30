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

export function pluralize(count, one, few, many) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod100 >= 11 && mod100 <= 19) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
