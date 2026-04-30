/**
 * Export data as CSV file download.
 * @param {Array<Object>} data - Array of row objects
 * @param {Array<{key: string, label: string}>} columns - Column definitions
 * @param {string} filename - Download filename
 */
export function exportCSV(data, columns, filename = 'export.csv') {
  const BOM = '\uFEFF' // UTF-8 BOM for Excel
  const header = columns.map((c) => `"${c.label}"`).join(',')
  const rows = data.map((row) =>
    columns.map((c) => {
      const val = row[c.key]
      if (val == null) return '""'
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }).join(',')
  )

  const csv = BOM + [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
