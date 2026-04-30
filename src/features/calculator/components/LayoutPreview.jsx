/**
 * Visual preview of how stickers are laid out on the print sheet.
 */
export function LayoutPreview({ width, height, itemsPerSheet, sheets }) {
  if (!width || !height || !itemsPerSheet) return null

  const SHEET_W = 300 // px display width
  const printWidth = 1230 // mm
  const gap = 6 // mm
  const margin = 30 // mm

  const scale = SHEET_W / printWidth
  const itemW = width * scale
  const itemH = height * scale
  const gapPx = gap * scale
  const sheetH = (height + margin) * scale

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h3 className="font-semibold mb-3">Раскладка на листе</h3>
      <p className="text-xs text-text-muted mb-3">
        {itemsPerSheet} шт/лист × {sheets} листов = {itemsPerSheet * sheets} шт (макс)
      </p>
      <div
        className="bg-white border border-border rounded relative mx-auto overflow-hidden"
        style={{ width: SHEET_W, height: Math.max(sheetH, 40) }}
      >
        {Array.from({ length: Math.min(itemsPerSheet, 50) }).map((_, i) => (
          <div
            key={i}
            className="absolute bg-accent/20 border border-accent/40 rounded-sm"
            style={{
              width: Math.max(itemW - 1, 2),
              height: Math.max(itemH - 1, 2),
              left: i * (itemW + gapPx),
              top: margin * scale / 2,
            }}
          />
        ))}
        {itemsPerSheet > 50 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-text-muted bg-white/80">
            Показаны первые 50 из {itemsPerSheet}
          </div>
        )}
      </div>
    </div>
  )
}
