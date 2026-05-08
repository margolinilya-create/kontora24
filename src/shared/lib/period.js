import { MS_PER_DAY } from '@/shared/constants'

/**
 * Преобразовать выбор периода (для аналитики/дашборда) в ISO-диапазон.
 * Если customFrom > customTo — меняем местами (вместо тихого пустого результата).
 *
 * @param {string} period - '7' | '30' | '90' | 'all' | 'custom' | число (дней)
 * @param {string} [customFrom] - YYYY-MM-DD
 * @param {string} [customTo] - YYYY-MM-DD (включая)
 * @returns {{ from: string|null, to: string|null }}
 */
export function periodRange(period, customFrom, customTo) {
  if (period === 'all') return { from: null, to: null }
  if (period === 'custom') {
    const fromDate = customFrom ? new Date(customFrom) : null
    const toDate = customTo ? new Date(customTo) : null
    const [a, b] = fromDate && toDate && fromDate > toDate ? [toDate, fromDate] : [fromDate, toDate]
    return {
      from: a ? a.toISOString() : null,
      to: b ? new Date(b.getTime() + MS_PER_DAY).toISOString() : null,
    }
  }
  return { from: new Date(Date.now() - Number(period) * MS_PER_DAY).toISOString(), to: null }
}
