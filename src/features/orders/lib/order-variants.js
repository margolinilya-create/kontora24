// R25.4 (ТЗ 4.6): виды изделий в форме заказа — до 9. У каждого вида размер
// (пусто = общий размер заказа) и тираж; тираж заказа = сумма тиражей видов.
// Чистые функции без React.

const EMPTY_VARIANT = { width_mm: '', height_mm: '', qty: '' }

/**
 * Подогнать массив видов под новое количество. При переходе с одного вида на
 * несколько первый вид получает текущий тираж заказа (чтобы не терять ввод).
 */
export function resizeVariants(prev, count, currentQty) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  if (n <= 1) return []
  const result = (prev || []).slice(0, n).map((v) => ({ ...v }))
  if (result.length === 0) {
    const q = Math.floor(Number(currentQty) || 0)
    result.push({ ...EMPTY_VARIANT, qty: q > 0 ? String(q) : '' })
  }
  while (result.length < n) result.push({ ...EMPTY_VARIANT })
  return result
}

/** Виды с разрешённым размером: пустая ширина/длина → общий размер заказа. */
export function buildVariantRows(variants, commonWidth, commonHeight) {
  const cw = Number(commonWidth) || 0
  const ch = Number(commonHeight) || 0
  return (variants || []).map((v, i) => {
    const ownW = Number(v.width_mm) || 0
    const ownH = Number(v.height_mm) || 0
    return {
      idx: i + 1,
      width_mm: ownW > 0 ? ownW : cw,
      height_mm: ownH > 0 ? ownH : ch,
      qty: Math.max(0, Math.floor(Number(v.qty) || 0)),
      customSize: ownW > 0 || ownH > 0,
    }
  })
}

export function variantsTotalQty(rows) {
  return (rows || []).reduce((sum, r) => sum + (Number(r.qty) || 0), 0)
}
