// A4 at 72dpi: 595 × 842 px
// 1mm = 2.833px at 72dpi
export const MM_TO_PX = 2.833
export const A4_WIDTH_PX = 595
export const A4_HEIGHT_PX = 842

export function mmToPx(mm) {
  return Math.round(mm * MM_TO_PX)
}

// R25.4: перенесён в shared/lib/utils.js (поддержка product_name у «Прочее»).
export { formatOrderType } from '@/shared/lib/utils'

// R27.0 (ТЗ №2): кегль номера на образце. Базовый 52px; если номер (например,
// длинный custom_number) не влезает в maxWidth — уменьшаем кегль, но не ниже
// min. measure(text, fontSizePx) → ширина текста в CSS px; в компоненте это
// обёртка над CanvasRenderingContext2D.measureText, в тестах — фейк.
export const SAMPLE_NUMBER_FONT_PX = 52
export const SAMPLE_NUMBER_CAPSULE_MAX_PX = 760
export const SAMPLE_NUMBER_CAPSULE_PAD_PX = 40
export const SAMPLE_NUMBER_TEXT_MAX_PX = SAMPLE_NUMBER_CAPSULE_MAX_PX - 2 * SAMPLE_NUMBER_CAPSULE_PAD_PX

export function fitNumberFontSize(text, measure, maxWidth = SAMPLE_NUMBER_TEXT_MAX_PX, { base = SAMPLE_NUMBER_FONT_PX, min = 20 } = {}) {
  if (!text || typeof measure !== 'function') return base
  const width = Number(measure(text, base))
  if (!Number.isFinite(width) || width <= maxWidth) return base
  // Ширина текста линейна по кеглю — считаем пропорцией, затем страхуемся
  // пошаговым уменьшением (хинтинг/кернинг могут дать +1px).
  let size = Math.floor((base * maxWidth) / width)
  while (size > min && Number(measure(text, size)) > maxWidth) size -= 1
  return Math.max(min, Math.min(base, size))
}
