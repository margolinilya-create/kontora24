/**
 * Хелперы отображения multi-variant заказов (k24_order_items).
 * R18.1 (бриф 30.06): в обзоре и тех-карте нужно показывать общий тираж
 * (сумму по видам) и перечень размеров по каждому виду, а не только первый.
 *
 * Чистые функции — переиспользуются в OverviewTab, TechCard.
 */

/** Есть ли несколько видов изделий (multi-variant). */
export function isMultiVariant(items) {
  return Array.isArray(items) && items.length > 1
}

/** Сумма тиражей по всем видам. */
export function sumVariantQty(items) {
  if (!Array.isArray(items)) return 0
  return items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0)
}

/**
 * Размеры по видам в строку: «74×105, 105×148 мм».
 * @param {{ width_mm:number, height_mm:number }[]} items
 */
export function formatVariantSizes(items) {
  if (!Array.isArray(items) || items.length === 0) return ''
  return items
    .map((it) => `${Number(it.width_mm)}×${Number(it.height_mm)}`)
    .join(', ') + ' мм'
}
