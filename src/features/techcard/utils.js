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
