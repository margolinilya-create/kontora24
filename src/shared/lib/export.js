/**
 * Export data as CSV file download.
 * \u041F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0434\u0432\u0435 \u0441\u0438\u0433\u043D\u0430\u0442\u0443\u0440\u044B:
 *   exportCSV(data, columns, filename)   \u2014 \u044F\u0432\u043D\u044B\u0435 \u043A\u043E\u043B\u043E\u043D\u043A\u0438 [{key, label, format?}]
 *   exportCSV(data, filename)            \u2014 \u0430\u0432\u0442\u043E-\u043A\u043E\u043B\u043E\u043D\u043A\u0438 \u0438\u0437 \u043A\u043B\u044E\u0447\u0435\u0439 \u043E\u0431\u044A\u0435\u043A\u0442\u043E\u0432
 */
export function exportCSV(data, columnsOrFilename, filename = 'export.csv') {
  let columns
  let name
  if (typeof columnsOrFilename === 'string') {
    name = columnsOrFilename
    const first = (data && data[0]) || {}
    columns = Object.keys(first).map((k) => ({ key: k, label: k }))
  } else {
    columns = columnsOrFilename || []
    name = filename
  }
  if (!name.endsWith('.csv')) name = `${name}.csv`

  const BOM = '\uFEFF' // UTF-8 BOM for Excel
  const header = columns.map((c) => `"${c.label}"`).join(',')
  const rows = (data || []).map((row) =>
    columns.map((c) => {
      const val = c.format ? c.format(row[c.key], row) : row[c.key]
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
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
