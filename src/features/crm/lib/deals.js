// R28.1 — чистые функции сделок (канбан, суммы, «залежавшиеся», прогноз).

const DAY_MS = 24 * 60 * 60 * 1000

/** Этапы воронки по порядку, без архивных. */
export function activeStages(stages) {
  return (stages || []).filter((s) => !s.archived_at).sort((a, b) => a.sort - b.sort)
}

/** { [stageId]: deal[] } — у каждого этапа массив (пустой, если сделок нет). */
export function groupDealsByStage(deals, stages) {
  const groups = {}
  for (const s of stages || []) groups[s.id] = []
  for (const d of deals || []) {
    if (groups[d.stage_id]) groups[d.stage_id].push(d)
  }
  for (const id of Object.keys(groups)) {
    groups[id].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
  }
  return groups
}

/** Сумма и количество сделок в колонке. */
export function stageTotals(deals) {
  let sum = 0
  for (const d of deals || []) sum += Number(d.amount) || 0
  return { count: (deals || []).length, sum }
}

/** Сколько полных дней сделка стоит на текущем этапе. */
export function daysInStage(deal, now = new Date()) {
  if (!deal?.stage_changed_at) return 0
  return Math.max(0, Math.floor((now - new Date(deal.stage_changed_at)) / DAY_MS))
}

/** «Залежалась»: открытый этап с лимитом и превышение лимита. */
export function isRotting(deal, stage, now = new Date()) {
  if (!stage || stage.kind !== 'open' || !stage.rot_days) return false
  return daysInStage(deal, now) > stage.rot_days
}

/** Просрочена ожидаемая дата закрытия (только для открытых). */
export function isOverdue(deal, stage, now = new Date()) {
  if (!deal?.expected_close || !stage || stage.kind !== 'open') return false
  const end = new Date(`${deal.expected_close}T23:59:59`)
  return end < now
}

/** Взвешенный прогноз: Σ сумма × вероятность этапа по открытым сделкам. */
export function weightedForecast(deals, stagesById) {
  let total = 0
  for (const d of deals || []) {
    const st = stagesById[d.stage_id]
    if (!st || st.kind !== 'open') continue
    total += (Number(d.amount) || 0) * (st.probability || 0) / 100
  }
  return Math.round(total)
}

/** Переход на этап «проиграна» требует причину. */
export function needsLostReason(stage) {
  return stage?.kind === 'lost'
}

/** Значения формы заказа из сделки (CreateOrderForm initialValues). */
export function orderPrefillFromDeal(deal) {
  if (!deal) return {}
  const out = { deal_name: deal.title || '' }
  if (deal.client?.name) out.client_name = deal.client.name
  if (deal.amount != null && Number(deal.amount) > 0) out.price_final = String(Number(deal.amount))
  if (deal.expected_close) out.deadline = deal.expected_close
  if (deal.source) out.source = deal.source
  return out
}

// ---------------------------------------------------------------------------
// R28.4 — аналитика продаж
// ---------------------------------------------------------------------------

/** Сделки, созданные в периоде [from, to] (ISO или null), без архивных. */
export function dealsInPeriod(deals, from, to) {
  const f = from ? new Date(from).getTime() : -Infinity
  const t = to ? new Date(to).getTime() : Infinity
  return (deals || []).filter((d) => {
    if (d.archived_at) return false
    const c = new Date(d.created_at).getTime()
    return c >= f && c <= t
  })
}

/** Создано, выиграно/проиграно, доля выигранных (от закрытых), средний чек, средний цикл (дни). */
export function summarizeSales(deals, stagesById) {
  let won = 0; let wonSum = 0; let lost = 0; let open = 0; let openSum = 0; let cycleDays = 0
  for (const d of deals || []) {
    const kind = stagesById[d.stage_id]?.kind
    const amount = Number(d.amount) || 0
    if (kind === 'won') {
      won += 1; wonSum += amount
      if (d.closed_at) cycleDays += Math.max(0, (new Date(d.closed_at) - new Date(d.created_at)) / DAY_MS)
    } else if (kind === 'lost') {
      lost += 1
    } else if (kind === 'open') {
      open += 1; openSum += amount
    }
  }
  const closed = won + lost
  return {
    created: (deals || []).length, won, wonSum, lost, open, openSum,
    winRate: closed ? Math.round((won / closed) * 100) : null,
    avgWon: won ? Math.round(wonSum / won) : null,
    avgCycleDays: won ? Math.round(cycleDays / won) : null,
  }
}

/**
 * Воронка: сколько сделок дошло до каждого открытого этапа. Достигнутый этап —
 * максимум из текущего и пройденных по ленте (meta.from/meta.to — имена этапов).
 * Выигранная считается прошедшей все открытые этапы.
 */
export function buildFunnel(deals, stages, stageActivities) {
  const open = activeStages(stages).filter((s) => s.kind === 'open')
  if (!open.length) return []
  const byName = new Map(open.map((s) => [s.name, s]))
  const maxOpenSort = open[open.length - 1].sort
  const stageById = Object.fromEntries((stages || []).map((s) => [s.id, s]))
  const reached = new Map()
  for (const d of deals || []) {
    const cur = stageById[d.stage_id]
    reached.set(d.id, cur?.kind === 'won' ? maxOpenSort : cur?.kind === 'open' ? cur.sort : -Infinity)
  }
  for (const a of stageActivities || []) {
    if (!reached.has(a.deal_id)) continue
    for (const name of [a.meta?.from, a.meta?.to]) {
      const s = byName.get(name)
      if (s && s.sort > reached.get(a.deal_id)) reached.set(a.deal_id, s.sort)
    }
  }
  const total = (deals || []).length
  return open.map((s) => {
    let count = 0
    for (const v of reached.values()) if (v >= s.sort) count += 1
    return { stageId: s.id, name: s.name, color: s.color, count, pct: total ? Math.round((count / total) * 100) : 0 }
  })
}

/** Группировка → [{ key, label, count, won, wonSum }] по убыванию количества. */
export function groupDeals(deals, stagesById, keyFn, labelFn) {
  const map = new Map()
  for (const d of deals || []) {
    const key = keyFn(d) ?? '—'
    const row = map.get(key) || { key, label: labelFn(key), count: 0, won: 0, wonSum: 0 }
    row.count += 1
    if (stagesById[d.stage_id]?.kind === 'won') {
      row.won += 1
      row.wonSum += Number(d.amount) || 0
    }
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

/** Прогноз по месяцам ожидаемого закрытия: Σ сумма × вероятность (только открытые). */
export function forecastByMonth(deals, stagesById, now = new Date()) {
  const thisMonth = now.toISOString().slice(0, 7)
  const map = new Map()
  for (const d of deals || []) {
    const st = stagesById[d.stage_id]
    if (!st || st.kind !== 'open' || d.archived_at) continue
    const key = d.expected_close ? d.expected_close.slice(0, 7) : 'без даты'
    const row = map.get(key) || { month: key, count: 0, sum: 0, weighted: 0, overdue: key !== 'без даты' && key < thisMonth }
    row.count += 1
    row.sum += Number(d.amount) || 0
    row.weighted += (Number(d.amount) || 0) * (st.probability || 0) / 100
    map.set(key, row)
  }
  return [...map.values()]
    .map((r) => ({ ...r, weighted: Math.round(r.weighted) }))
    .sort((a, b) => (a.month === 'без даты' ? 1 : b.month === 'без даты' ? -1 : a.month.localeCompare(b.month)))
}
