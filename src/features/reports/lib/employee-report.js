/**
 * R22.2 (ТЗ 20.07 Фаза 2) — подневный Excel-отчёт сотрудника.
 *
 * Чистые функции построения AoA (array of arrays) для downloadXlsx.
 * worker.days — { 'dd.MM.yy': { minutes, poured, selected, assembled, packaged, payout } }.
 */

const WEEKDAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

/** Парсит ключ дня 'dd.MM.yy' в Date (локальная полночь). */
export function parseDayKey(key) {
  const [dd, mm, yy] = String(key).split('.').map((s) => parseInt(s, 10))
  if (!dd || !mm) return null
  return new Date(2000 + (yy || 0), mm - 1, dd)
}

export const EMPLOYEE_REPORT_HEADER = [
  'Дата', 'День недели', 'Отработанные часы',
  'Залито, шт', 'Выбрано, шт', 'Собрано паков', 'Упаковано', 'Заработок, ₽',
]

/**
 * Строит AoA отчёта. Строки — только дни с активностью, в диапазоне [from, to]
 * (Date | null — без границы). Последняя строка — «Общее» с суммами.
 */
export function buildEmployeeReportAoa(worker, { from = null, to = null } = {}) {
  const entries = Object.entries(worker?.days || {})
    .map(([key, d]) => ({ key, date: parseDayKey(key), d }))
    .filter((e) => e.date)
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .sort((a, b) => a.date - b.date)

  const totals = { minutes: 0, poured: 0, selected: 0, assembled: 0, packaged: 0, payout: 0 }
  const rows = entries.map(({ date, d }) => {
    totals.minutes += d.minutes || 0
    totals.poured += d.poured || 0
    totals.selected += d.selected || 0
    totals.assembled += d.assembled || 0
    totals.packaged += d.packaged || 0
    totals.payout += d.payout || 0
    return [
      `${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`,
      WEEKDAYS_RU[date.getDay()],
      Number(((d.minutes || 0) / 60).toFixed(1)),
      d.poured || 0, d.selected || 0, d.assembled || 0, d.packaged || 0,
      Math.round(d.payout || 0),
    ]
  })

  const totalRow = [
    'Общее', '',
    Number((totals.minutes / 60).toFixed(1)),
    totals.poured, totals.selected, totals.assembled, totals.packaged,
    Math.round(totals.payout),
  ]

  return [EMPLOYEE_REPORT_HEADER, ...rows, totalRow]
}
