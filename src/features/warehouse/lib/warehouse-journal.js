/**
 * R25.8 (ТЗ Фаза 8) — журнал склада: чистая логика без React.
 *
 * - Виды операций и классификатор причин (зеркало SQL k24_classify_material_tx,
 *   миграция 096 — таблица 8.3 ТЗ).
 * - «Остаток после» назад от текущего остатка (зеркало окна в view
 *   k24_material_movements).
 * - Равенство оборотной ведомости (8.6).
 * - Периоды (по Москве), фильтры ↔ URL, фильтры → p_filters RPC.
 * - Построители листов Excel (AOA) для журнала / поступлений / сводки /
 *   истории позиции. Без права «Видеть финансы» денежных колонок нет совсем.
 */

// ── Виды операций ──────────────────────────────────────────────────────────

export const OPERATION_KINDS = {
  purchase: { label: 'Поступление', tone: 'success' },
  opening: { label: 'Начальный остаток', tone: 'info' },
  order_consumption: { label: 'Списание на заказ', tone: 'danger' },
  manual_consumption: { label: 'Расход вручную', tone: 'warning' },
  inventory: { label: 'Инвентаризация', tone: 'info' },
  correction: { label: 'Возврат / корректировка', tone: 'muted' },
}

export const OPERATION_KIND_KEYS = Object.keys(OPERATION_KINDS)

export function operationKindLabel(kind) {
  return OPERATION_KINDS[kind]?.label || kind || '—'
}

/** Виды, которые можно выставить через «Уточнить», в зависимости от знака. */
export function editableKindsForDelta(delta) {
  const d = Number(delta)
  if (d > 0) return ['purchase', 'opening', 'inventory', 'correction']
  if (d < 0) return ['manual_consumption', 'opening', 'inventory', 'correction']
  return ['inventory', 'correction']
}

const SYSTEM_MANUAL_REASONS = new Set(['Инвентаризация', 'Приход', 'Расход'])

/**
 * Классификатор (таблица 8.3). Зеркало SQL k24_classify_material_tx — при
 * изменении правила менять в обоих местах.
 * @returns {{ kind: string, isAuto: boolean, needsReview: boolean }}
 */
export function classifyMaterialOperation(reason, delta) {
  const r = String(reason ?? '').trim()
  const d = Number(delta) || 0
  const isWriteoff = r.startsWith('Списание по факту') || r.startsWith('Авто:') || r.startsWith('auto_')
  const isReturn = r.startsWith('Возврат')
  let kind
  if (isWriteoff) kind = d < 0 ? 'order_consumption' : 'correction'
  else if (isReturn) kind = 'correction'
  else if (r.startsWith('Начальный остаток')) kind = 'opening'
  else if (r === 'Инвентаризация') kind = 'inventory'
  else if (d > 0) kind = 'purchase'
  else if (d < 0) kind = 'manual_consumption'
  else kind = 'correction'
  const needsReview = !(
    isWriteoff || isReturn || r.startsWith('Начальный остаток') || r.startsWith('Заказ #') || SYSTEM_MANUAL_REASONS.has(r)
  )
  return { kind, isAuto: isWriteoff || isReturn, needsReview }
}

// ── «Остаток после» ─────────────────────────────────────────────────────────

/** Сортировка «новые сверху»: op_date DESC, created_at DESC, id DESC. */
export function compareMovementsDesc(a, b) {
  if (a.op_date !== b.op_date) return a.op_date < b.op_date ? 1 : -1
  const ca = a.created_at || ''
  const cb = b.created_at || ''
  if (ca !== cb) return ca < cb ? 1 : -1
  return String(a.id) < String(b.id) ? 1 : String(a.id) > String(b.id) ? -1 : 0
}

/**
 * Остаток после каждой операции, считая назад от текущего остатка
 * (как окно в view k24_material_movements). У самой свежей = currentStock.
 * Возвращает новые объекты в порядке «новые сверху».
 */
export function computeBalanceAfter(rows, currentStock) {
  const sorted = [...rows].sort(compareMovementsDesc)
  let after = Number(currentStock) || 0
  return sorted.map((r) => {
    const out = { ...r, balance_after: roundQty(after) }
    after -= Number(r.delta) || 0
    return out
  })
}

function roundQty(n) {
  return Math.round(n * 1e6) / 1e6
}

// ── Оборотная ведомость ─────────────────────────────────────────────────────

/** начало + поступило − списано − расход ± инвентаризация ± корректировки. */
export function expectedClosing(row) {
  return (
    Number(row.opening || 0)
    + Number(row.purchased || 0)
    - Number(row.order_consumption || 0)
    - Number(row.manual_consumption || 0)
    + Number(row.inventory || 0)
    + Number(row.corrections || 0)
  )
}

export function isTurnoverBalanced(row, eps = 1e-6) {
  return Math.abs(expectedClosing(row) - Number(row.closing || 0)) < eps
}

const TURNOVER_QTY_FIELDS = ['opening', 'purchased', 'order_consumption', 'manual_consumption', 'inventory', 'corrections', 'closing']

/**
 * Группировка строк warehouse_turnover по категориям. Количества категории
 * складываются, только если у её позиций одна единица (иначе qty = null и
 * mixedUnits = true → «—» с подсказкой «разные единицы»). Рубли — всегда.
 */
export function groupTurnoverByCategory(rows) {
  const map = new Map()
  for (const r of rows || []) {
    const key = r.category_id || '__none__'
    if (!map.has(key)) {
      map.set(key, { key, category_id: r.category_id || null, name: r.category_name || 'Без категории', rows: [] })
    }
    map.get(key).rows.push(r)
  }
  return [...map.values()].map((g) => {
    const units = new Set(g.rows.map((r) => r.unit))
    const mixedUnits = units.size > 1
    const totals = {}
    for (const f of TURNOVER_QTY_FIELDS) {
      totals[f] = mixedUnits ? null : g.rows.reduce((s, r) => s + Number(r[f] || 0), 0)
    }
    const sums = g.rows.map((r) => r.purchase_sum).filter((v) => v != null)
    totals.purchase_count = g.rows.reduce((s, r) => s + Number(r.purchase_count || 0), 0)
    totals.purchase_sum = sums.length ? sums.reduce((s, v) => s + Number(v), 0) : null
    totals.last_purchase_date = g.rows.reduce((m, r) => (r.last_purchase_date && (!m || r.last_purchase_date > m) ? r.last_purchase_date : m), null)
    return { ...g, unit: mixedUnits ? null : [...units][0], mixedUnits, totals }
  })
}

/**
 * Группировка поступлений (строки журнала) по категориям: число поставок,
 * количество (если одна единица), сумма (если видна), дата последнего.
 */
export function groupReceiptsByCategory(rows) {
  const map = new Map()
  for (const r of rows || []) {
    const key = r.category_id || '__none__'
    if (!map.has(key)) map.set(key, { key, category_id: r.category_id || null, name: r.category_name || 'Без категории', rows: [] })
    map.get(key).rows.push(r)
  }
  const groups = [...map.values()].map((g) => {
    const units = new Set(g.rows.map((r) => r.unit))
    const mixedUnits = units.size > 1
    const costs = g.rows.map((r) => r.total_cost).filter((v) => v != null)
    return {
      ...g,
      count: g.rows.length,
      unit: mixedUnits ? null : [...units][0],
      mixedUnits,
      qty: mixedUnits ? null : g.rows.reduce((s, r) => s + Number(r.delta || 0), 0),
      sum: costs.length ? costs.reduce((s, v) => s + Number(v), 0) : null,
      lastDate: g.rows.reduce((m, r) => (!m || r.op_date > m ? r.op_date : m), null),
    }
  })
  groups.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const allCosts = groups.map((g) => g.sum).filter((v) => v != null)
  return {
    groups,
    total: {
      count: groups.reduce((s, g) => s + g.count, 0),
      sum: allCosts.length ? allCosts.reduce((s, v) => s + v, 0) : null,
    },
  }
}

// ── Даты и периоды (Москва) ─────────────────────────────────────────────────

/** 'YYYY-MM-DD' в часовом поясе Москвы. */
export function moscowDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Дата операции (по Москве) отличается от даты внесения? */
export function enteredOnOtherDay(row) {
  if (!row?.created_at || !row?.op_date) return false
  return moscowDateString(new Date(row.created_at)) !== row.op_date
}

function pad(n) { return String(n).padStart(2, '0') }
function ymd(y, m, d) { return `${y}-${pad(m)}-${pad(d)}` }
function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate() }

export const JOURNAL_PERIODS = [
  { value: 'today', label: 'Сегодня' },
  { value: '7d', label: '7 дней' },
  { value: 'month', label: 'Этот месяц' },
  { value: 'prev_month', label: 'Прошлый месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
  { value: 'all', label: 'Всё время' },
  { value: 'custom', label: 'Свой' },
]

/**
 * Период → { from, to } ('YYYY-MM-DD' или null). today — 'YYYY-MM-DD' по Москве.
 * custom использует from/to как есть.
 */
export function periodRange(period, today = moscowDateString(), custom = {}) {
  const [y, m, d] = today.split('-').map(Number)
  switch (period) {
    case 'today': return { from: today, to: today }
    case '7d': {
      const dt = new Date(Date.UTC(y, m - 1, d - 6))
      return { from: dt.toISOString().slice(0, 10), to: today }
    }
    case 'month': return { from: ymd(y, m, 1), to: today }
    case 'prev_month': {
      const pm = m === 1 ? 12 : m - 1
      const py = m === 1 ? y - 1 : y
      return { from: ymd(py, pm, 1), to: ymd(py, pm, lastDay(py, pm)) }
    }
    case 'quarter': {
      const qm = Math.floor((m - 1) / 3) * 3 + 1
      return { from: ymd(y, qm, 1), to: today }
    }
    case 'year': return { from: ymd(y, 1, 1), to: today }
    case 'custom': return { from: custom.from || null, to: custom.to || null }
    case 'all':
    default: return { from: null, to: null }
  }
}

/** Человекочитаемый период: «01.10.2026–31.10.2026» / «всё время». */
export function formatRangeLabel({ from, to }) {
  const f = (s) => (s ? s.split('-').reverse().join('.') : '')
  if (!from && !to) return 'всё время'
  if (from && to) return `${f(from)}–${f(to)}`
  return from ? `с ${f(from)}` : `по ${f(to)}`
}

// ── Фильтры журнала ↔ URL ───────────────────────────────────────────────────

export const DEFAULT_JOURNAL_FILTERS = {
  period: 'all',
  from: '',
  to: '',
  categories: [],
  material: '',
  kinds: [],
  auto: '',
  review: false,
  supplier: '',
  order: '',
  user: '',
  q: '',
  sort: 'date_desc',
}

export const JOURNAL_SORTS = {
  date_desc: [['op_date', false], ['created_at', false], ['id', false]],
  date_asc: [['op_date', true], ['created_at', true], ['id', true]],
  material_asc: [['material_name', true], ['op_date', false], ['created_at', false]],
  qty_desc: [['delta', false], ['op_date', false]],
  qty_asc: [['delta', true], ['op_date', false]],
}

const LIST_KEYS = ['categories', 'kinds']

/** URLSearchParams → фильтры журнала (неизвестные ключи игнорируются). */
export function parseJournalFilters(searchParams) {
  const sp = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams || '')
  const out = { ...DEFAULT_JOURNAL_FILTERS }
  for (const key of Object.keys(DEFAULT_JOURNAL_FILTERS)) {
    const v = sp.get(key)
    if (v == null) continue
    if (LIST_KEYS.includes(key)) out[key] = v.split(',').filter(Boolean)
    else if (key === 'review') out.review = v === '1'
    else out[key] = v
  }
  if (out.kinds.length) out.kinds = out.kinds.filter((k) => OPERATION_KINDS[k])
  if (!JOURNAL_SORTS[out.sort]) out.sort = 'date_desc'
  if (!['', 'auto', 'manual'].includes(out.auto)) out.auto = ''
  return out
}

/**
 * Фильтры → объект для setSearchParams (только отличающиеся от дефолта).
 * base — прочие параметры адреса (например tab), сохраняются.
 */
export function serializeJournalFilters(filters, base = {}) {
  const out = { ...base }
  for (const [key, def] of Object.entries(DEFAULT_JOURNAL_FILTERS)) {
    const v = filters[key]
    if (LIST_KEYS.includes(key)) {
      if (Array.isArray(v) && v.length) out[key] = v.join(',')
    } else if (key === 'review') {
      if (v) out.review = '1'
    } else if (v != null && v !== '' && v !== def) {
      out[key] = String(v)
    }
  }
  return out
}

/** Фильтры журнала → p_filters для RPC warehouse_movements / totals. */
export function buildRpcFilters(filters, today = moscowDateString()) {
  const { from, to } = periodRange(filters.period, today, { from: filters.from, to: filters.to })
  const p = {}
  if (from) p.from = from
  if (to) p.to = to
  if (filters.categories?.length) p.category_ids = filters.categories
  if (filters.material) p.material_id = filters.material
  if (filters.kinds?.length) p.kinds = filters.kinds
  if (filters.auto === 'auto' || filters.auto === 'manual') p.auto = filters.auto
  if (filters.review) p.needs_review = true
  if (filters.supplier?.trim()) p.supplier = filters.supplier.trim()
  if (filters.order?.trim()) p.order_number = filters.order.trim().replace(/^#/, '')
  if (filters.user) p.created_by = filters.user
  if (filters.q?.trim()) p.q = filters.q.trim()
  return p
}

// ── Excel (AOA) ─────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' → Date (полдень UTC, чтобы Excel не съехал на день). */
export function excelDate(s) {
  if (!s) return null
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d, 12))
}

/** timestamptz → Date для Excel (как есть). */
export function excelDateTime(s) {
  if (!s) return null
  const dt = new Date(s)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function num(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function orderLabel(r) {
  if (r.order_custom_number) return r.order_custom_number
  return r.order_number != null ? r.order_number : null
}

function whoLabel(r) {
  return r.created_by_name || (r.is_auto ? 'Система' : '')
}

/**
 * Лист «Операции» журнала. showBalance — колонка «Остаток после» (фильтр по
 * одной позиции). showMoney — суммы/цены (только с view:finance).
 */
export function buildJournalAoa(rows, { showMoney = false, showBalance = false } = {}) {
  const header = ['Дата операции', 'Внесено', 'Категория', 'Позиция', 'Вид', 'Авто', 'Количество', 'Ед.']
  if (showBalance) header.push('Остаток после')
  if (showMoney) header.push('Сумма, ₽', 'Цена за ед., ₽')
  header.push('Поставщик', '№ документа', 'Заказ', 'Комментарий', 'Кто')
  const body = (rows || []).map((r) => {
    const row = [
      excelDate(r.op_date), excelDateTime(r.created_at), r.category_name || '', r.material_name || '',
      operationKindLabel(r.kind), r.is_auto ? 'да' : 'нет', num(r.delta), r.unit || '',
    ]
    if (showBalance) row.push(num(r.balance_after))
    if (showMoney) row.push(num(r.total_cost), num(r.unit_cost))
    row.push(r.supplier || '', r.doc_number || '', orderLabel(r), r.reason || '', whoLabel(r))
    return row
  })
  return [header, ...body]
}

/** Лист «История» карточки позиции — с остатком после каждой операции. */
export function buildHistoryAoa(rows, { showMoney = false } = {}) {
  const header = ['Дата операции', 'Внесено', 'Вид', 'Авто', 'Количество', 'Ед.', 'Остаток после']
  if (showMoney) header.push('Сумма, ₽', 'Цена за ед., ₽')
  header.push('Поставщик', '№ документа', 'Заказ', 'Комментарий', 'Кто')
  const body = (rows || []).map((r) => {
    const row = [
      excelDate(r.op_date), excelDateTime(r.created_at), operationKindLabel(r.kind), r.is_auto ? 'да' : 'нет',
      num(r.delta), r.unit || '', num(r.balance_after),
    ]
    if (showMoney) row.push(num(r.total_cost), num(r.unit_cost))
    row.push(r.supplier || '', r.doc_number || '', orderLabel(r), r.reason || '', whoLabel(r))
    return row
  })
  return [header, ...body]
}

/** Лист «Поступления»: строки-итоги по категориям + общий итог. */
export function buildReceiptsAoa(rows, { showMoney = false } = {}) {
  const { groups, total } = groupReceiptsByCategory(rows)
  const header = ['Категория', 'Дата поступления', 'Позиция', 'Количество', 'Ед.']
  if (showMoney) header.push('Сумма, ₽', 'Цена за ед., ₽')
  header.push('Поставщик', '№ документа', 'Кто внёс', 'Внесено')
  const out = [header]
  for (const g of groups) {
    const totalRow = [`${g.name} — итого (${g.count} пост.)`, excelDate(g.lastDate), '', g.qty, g.unit || (g.mixedUnits ? 'разные' : '')]
    if (showMoney) totalRow.push(g.sum, null)
    totalRow.push('', '', '', null)
    out.push(totalRow)
    for (const r of [...g.rows].sort(compareMovementsDesc)) {
      const row = [g.name, excelDate(r.op_date), r.material_name || '', num(r.delta), r.unit || '']
      if (showMoney) row.push(num(r.total_cost), num(r.unit_cost))
      row.push(r.supplier || '', r.doc_number || '', whoLabel(r), excelDateTime(r.created_at))
      out.push(row)
    }
  }
  const grand = [`Итого: ${total.count} пост.`, null, '', null, '']
  if (showMoney) grand.push(total.sum, null)
  grand.push('', '', '', null)
  out.push(grand)
  return out
}

/** Лист «Сводка» — оборотная ведомость (по строке на позицию + итоги категорий). */
export function buildTurnoverAoa(rows, { showMoney = false } = {}) {
  const header = [
    'Категория', 'Позиция', 'Ед.', 'Остаток на начало', 'Поступило', 'Списано на заказы',
    'Расход вручную', 'Инвентаризация, ±', 'Возвраты и корректировки, ±', 'Остаток на конец',
    'Поставок', 'Последнее поступление',
  ]
  if (showMoney) header.push('Закуплено, ₽')
  const out = [header]
  const qtyCells = (o) => [num(o.opening), num(o.purchased), num(o.order_consumption), num(o.manual_consumption), num(o.inventory), num(o.corrections), num(o.closing)]
  for (const g of groupTurnoverByCategory(rows)) {
    const t = g.totals
    const catRow = [g.name, 'Итого по категории', g.unit || (g.mixedUnits ? 'разные' : ''), ...qtyCells(t), t.purchase_count, excelDate(t.last_purchase_date)]
    if (showMoney) catRow.push(t.purchase_sum)
    out.push(catRow)
    for (const r of g.rows) {
      const row = [g.name, r.material_name + (r.archived ? ' (архив)' : ''), r.unit || '', ...qtyCells(r), num(r.purchase_count), excelDate(r.last_purchase_date)]
      if (showMoney) row.push(num(r.purchase_sum))
      out.push(row)
    }
  }
  return out
}

/** Лист «Параметры»: период, фильтры, кто и когда выгрузил. */
export function buildParamsAoa(entries, { user, at = new Date() } = {}) {
  return [
    ['Параметр', 'Значение'],
    ...entries.filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]),
    ['Выгрузил', user || ''],
    ['Когда', at],
  ]
}

/** Описание фильтров журнала для листа «Параметры». */
export function describeJournalFilters(filters, { categories = [], materials = [], users = [] } = {}, today = moscowDateString()) {
  const range = periodRange(filters.period, today, { from: filters.from, to: filters.to })
  const catNames = (filters.categories || []).map((id) => categories.find((c) => c.id === id)?.name || id)
  const mat = filters.material ? (materials.find((m) => m.id === filters.material)?.name || filters.material) : ''
  const user = filters.user ? (users.find((u) => u.id === filters.user)?.display_name || filters.user) : ''
  return [
    ['Период', formatRangeLabel(range)],
    ['Категории', catNames.join(', ')],
    ['Позиция', mat],
    ['Виды', (filters.kinds || []).map(operationKindLabel).join(', ')],
    ['Ручные / автоматические', filters.auto === 'auto' ? 'Автоматические' : filters.auto === 'manual' ? 'Ручные' : ''],
    ['Проверить после переноса', filters.review ? 'да' : ''],
    ['Поставщик', filters.supplier],
    ['Заказ', filters.order],
    ['Сотрудник', user],
    ['Поиск', filters.q],
  ]
}

export const EXPORT_CHUNK = 1000
export const EXPORT_CAP = 50000
