/**
 * Имя файла для download-атрибута: запрещённые в именах файлов символы
 * (Windows-набор) браузер молча отбрасывает вместе со всем атрибутом и
 * сохраняет как «download». Ловило период «Свой» — `custom:YYYY-MM-DD:…`
 * с двоеточиями (QA 04.07, баг №6).
 */
export function sanitizeFilename(name) {
  return String(name)
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
}

/**
 * Lazy-load SheetJS (~600 KB) and download a single-sheet XLSX.
 *
 * @param {string} filename — без расширения
 * @param {string} sheetName
 * @param {Array<Array<string|number>>} aoa — массив массивов: первая строка — заголовки
 */
export async function downloadXlsx(filename, sheetName, aoa) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // Авто-ширина колонок по максимальной длине ячейки
  const colWidths = aoa[0]?.map((_, colIdx) => {
    const max = aoa.reduce((m, row) => Math.max(m, String(row[colIdx] ?? '').length), 0)
    return { wch: Math.min(60, Math.max(8, max + 2)) }
  })
  if (colWidths) ws['!cols'] = colWidths
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, `${sanitizeFilename(filename) || 'report'}.xlsx`)
}

/**
 * Формат даты для ячейки: даты без времени builder'ы кладут как полдень UTC
 * (excelDate) — такие показываем «дд.мм.гггг», остальные — с временем.
 */
export function excelDateFormat(value) {
  return value.getUTCHours() === 12 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0
    ? 'dd.mm.yyyy'
    : 'dd.mm.yyyy hh:mm'
}

/**
 * R25.8: XLSX из нескольких листов. Числа пишутся числами, Date — датами Excel
 * (с форматом), null/undefined — пустыми ячейками.
 *
 * @param {string} filename — без расширения (санитизируется)
 * @param {Array<{ name: string, aoa: Array<Array<any>> }>} sheets
 */
export async function downloadXlsxBook(filename, sheets) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const used = new Set()
  for (const sheet of sheets) {
    const aoa = sheet.aoa || [[]]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    aoa.forEach((row, r) => {
      row.forEach((v, c) => {
        if (!(v instanceof Date)) return
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (cell) cell.z = excelDateFormat(v)
      })
    })
    const colWidths = (aoa[0] || []).map((_, colIdx) => {
      const max = aoa.reduce((m, row) => {
        const v = row[colIdx]
        const len = v instanceof Date ? 16 : String(v ?? '').length
        return Math.max(m, len)
      }, 0)
      return { wch: Math.min(60, Math.max(8, max + 2)) }
    })
    ws['!cols'] = colWidths
    let name = String(sheet.name || 'Лист').replace(/[\\/?*[\]:]/g, '-').slice(0, 31)
    while (used.has(name)) name = `${name.slice(0, 28)}_${used.size}`
    used.add(name)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  XLSX.writeFile(wb, `${sanitizeFilename(filename) || 'report'}.xlsx`)
}

/**
 * R25.8: забрать все строки порциями (PostgREST отдаёт ≤ 1000 за запрос).
 *
 * @param {(from: number, to: number) => Promise<Array>} fetchPage — диапазон включительно
 * @param {{ total?: number, chunk?: number, cap?: number, onProgress?: (loaded:number, total:number|undefined) => void }} opts
 * @returns {Promise<Array>}
 * @throws Error с code='EXPORT_TOO_LARGE', если total > cap
 */
export async function fetchAllChunked(fetchPage, { total, chunk = 1000, cap = 50000, onProgress } = {}) {
  if (total != null && total > cap) {
    const err = new Error(`Слишком много строк для выгрузки (${total}). Предел — ${cap}: сузьте период или фильтры.`)
    err.code = 'EXPORT_TOO_LARGE'
    throw err
  }
  const out = []
  for (let from = 0; ; from += chunk) {
    const rows = await fetchPage(from, from + chunk - 1)
    out.push(...(rows || []))
    onProgress?.(out.length, total)
    if (!rows || rows.length < chunk) break
    if (out.length >= cap) {
      const err = new Error(`Слишком много строк для выгрузки. Предел — ${cap}: сузьте период или фильтры.`)
      err.code = 'EXPORT_TOO_LARGE'
      throw err
    }
  }
  return out
}
