// R12.1 — рабочие дни (пн–пт, исключая госпраздники РФ).
// Все функции принимают/возвращают `Date` в UTC-полночь, чтобы сравнения
// шли по dateString без часовых поясов. Список праздников приходит из
// k24_settings.planning:holidays_2026 (массив 'YYYY-MM-DD' строк).

// День недели: 0 = воскресенье, 6 = суббота. Рабочие — пн(1) – пт(5).
export function isWeekend(date) {
  const d = date.getUTCDay()
  return d === 0 || d === 6
}

export function toISODate(date) {
  // Используем UTC чтобы исключить смещения часовых поясов.
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromISODate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

// Дата без времени (UTC-полночь) — для сравнений по календарному дню.
export function startOfUTCDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function isHoliday(date, holidays) {
  if (!holidays || holidays.length === 0) return false
  return holidays.includes(toISODate(date))
}

export function isWorkingDay(date, holidays = []) {
  return !isWeekend(date) && !isHoliday(date, holidays)
}

// Прибавить к дате N календарных дней.
export function addDays(date, n) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + n)
  return next
}

// Прибавить N рабочих дней к дате. n=0 возвращает ближайший рабочий день,
// начиная с переданной даты (включительно). n=1 — следующий рабочий день
// (если переданная дата — рабочий, то это завтра/послезавтра).
export function addWorkingDays(date, n, holidays = []) {
  let cur = startOfUTCDay(date)
  while (!isWorkingDay(cur, holidays)) cur = addDays(cur, 1)
  let remaining = n
  while (remaining > 0) {
    cur = addDays(cur, 1)
    while (!isWorkingDay(cur, holidays)) cur = addDays(cur, 1)
    remaining -= 1
  }
  return cur
}

// Список из `count` рабочих дней, начиная с ближайшего рабочего ≥ start.
export function getWorkingDays(start, count, holidays = []) {
  const out = []
  let cur = startOfUTCDay(start)
  while (out.length < count) {
    if (isWorkingDay(cur, holidays)) out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

// Последний рабочий день ≤ date (если date выпал на выходной/праздник —
// двигаем влево). §7.6 ТЗ: дедлайн на выходной отображается на ближайшей
// предыдущей пятнице (или предшествующем рабочем дне).
export function previousWorkingDay(date, holidays = []) {
  let cur = startOfUTCDay(date)
  while (!isWorkingDay(cur, holidays)) cur = addDays(cur, -1)
  return cur
}
