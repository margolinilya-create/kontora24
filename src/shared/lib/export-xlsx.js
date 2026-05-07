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
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
