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
