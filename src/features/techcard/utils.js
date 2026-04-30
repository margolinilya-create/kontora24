// A4 at 72dpi: 595 × 842 px
// 1mm = 2.833px at 72dpi
export const MM_TO_PX = 2.833
export const A4_WIDTH_PX = 595
export const A4_HEIGHT_PX = 842

export function mmToPx(mm) {
  return Math.round(mm * MM_TO_PX)
}

export function formatOrderType(type) {
  const MAP = {
    sticker_cut: 'Стикер (вырезка)',
    sticker_kiss: 'Стикер (поцелуйка)',
    stickerpack: 'Стикерпак',
    sticker3D: '3D стикер',
    stickerpack3D: '3D стикерпак',
    rect: 'Прямоугольный',
    big: 'Большой формат',
  }
  return MAP[type] || type
}
