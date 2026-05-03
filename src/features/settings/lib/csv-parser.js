/**
 * Parse CSV text into order objects.
 * Expected columns (flexible, matches by header name):
 *   номер | тип | ширина | высота | тираж | клиент | дедлайн | 3д | плёнка | ламинация | комментарий
 */

const COLUMN_MAP = {
  'номер': 'externalNumber',
  '№': 'externalNumber',
  'number': 'externalNumber',
  'тип': 'order_type',
  'type': 'order_type',
  'ширина': 'width_mm',
  'width': 'width_mm',
  'высота': 'height_mm',
  'height': 'height_mm',
  'тираж': 'qty',
  'количество': 'qty',
  'qty': 'qty',
  'клиент': 'clientName',
  'client': 'clientName',
  'дедлайн': 'deadline',
  'deadline': 'deadline',
  'дата': 'deadline',
  '3д': 'is_3d',
  '3d': 'is_3d',
  'плёнка': 'film_type',
  'пленка': 'film_type',
  'film': 'film_type',
  'ламинация': 'need_lam',
  'lam': 'need_lam',
  'комментарий': 'notes',
  'comment': 'notes',
  'notes': 'notes',
  'виды': 'design_variants',
  'variants': 'design_variants',
  'цена': 'price_final',
  'price': 'price_final',
}

const TYPE_MAP = {
  'стикер': 'sticker_cut',
  'вырубной': 'sticker_cut',
  'die cut': 'sticker_cut',
  'kiss cut': 'sticker_kiss',
  'подложка': 'sticker_kiss',
  'стикерпак': 'stickerpack',
  'пак': 'stickerpack',
  '3d': 'sticker3D',
  '3д': 'sticker3D',
  '3d пак': 'stickerpack3D',
  'прямоугольный': 'rect',
  'большой': 'big',
}

export function parseCSV(text) {
  const lines = text.trim().split('\n').map((l) => l.split(/[,;\t]/))
  if (lines.length < 2) return { rows: [], errors: ['Нужен заголовок + хотя бы одна строка'] }

  // Parse headers
  const headers = lines[0].map((h) => h.trim().toLowerCase().replace(/"/g, ''))
  const columnMapping = headers.map((h) => COLUMN_MAP[h] || null)

  const rows = []
  const errors = []

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]
    if (cells.length === 1 && !cells[0].trim()) continue // skip empty

    const row = {}
    cells.forEach((cell, idx) => {
      const field = columnMapping[idx]
      if (field) row[field] = cell.trim().replace(/"/g, '')
    })

    // Normalize type
    if (row.order_type) {
      const normalized = TYPE_MAP[row.order_type.toLowerCase()] || row.order_type
      row.order_type = normalized
    } else {
      row.order_type = 'sticker_cut'
    }

    // Normalize numbers
    row.width_mm = Number(row.width_mm) || 50
    row.height_mm = Number(row.height_mm) || 50
    row.qty = Number(row.qty) || 100
    row.design_variants = Number(row.design_variants) || 1
    row.price_final = row.price_final ? Number(row.price_final) : undefined

    // Normalize booleans
    row.is_3d = ['да', 'yes', '1', 'true', '3d', '3д'].includes(String(row.is_3d).toLowerCase())
    row.need_lam = ['да', 'yes', '1', 'true'].includes(String(row.need_lam).toLowerCase())

    // Validate
    if (row.qty <= 0) { errors.push(`Строка ${i + 1}: тираж <= 0`); continue }
    if (row.width_mm <= 0 || row.height_mm <= 0) { errors.push(`Строка ${i + 1}: размер <= 0`); continue }

    rows.push(row)
  }

  return { rows, errors, headers: columnMapping.filter(Boolean) }
}
