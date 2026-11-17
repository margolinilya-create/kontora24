import { MS_PER_DAY } from '@/shared/constants'

/**
 * Сегодняшняя (или переданная) дата в ЛОКАЛЬНОМ поясе как 'YYYY-MM-DD'.
 * Для дефолтов `<input type="date">` и имён файлов. `toISOString().slice(0,10)`
 * даёт дату по UTC — ночью по Москве (00:00–03:00) это «вчера».
 */
export function localIsoDate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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
