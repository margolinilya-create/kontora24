/**
 * R25.3 (ТЗ Фаза 3.1) — допечатки в списке заказов. Чистые функции без React:
 * фильтрация допечаток по фильтрам страницы «Заказы», раскладка «подзадача
 * сразу после родителя», счётчики для канбана и вкладки «Подзадачи».
 *
 * Элемент допечатки (из useActiveReprints):
 *   { id, status, qty, title, view_ref, item_idx, route, paused, order: {...},
 *     overall: { percentage, done } }
 */

/** Название допечатки: переименованное или «Допечатка #N к заказу #M». */
export function reprintDisplayTitle(reprint, orderNumberText) {
  const t = reprint?.title?.trim?.()
  if (t) return t
  const n = reprint?.item_idx ?? ''
  return `Допечатка #${n} к заказу #${orderNumberText}`
}

/** Допечатка активна — не завершена. */
export function isActiveReprint(reprint) {
  return !!reprint && reprint.status !== 'done'
}

function orderNumberText(order) {
  const custom = order?.custom_number?.trim?.()
  if (custom) return custom
  return String(order?.number ?? '')
}

/**
 * Подходит ли допечатка под фильтры страницы. Этап — СОБСТВЕННЫЙ этап
 * допечатки (ТЗ: «фильтры применяются к её собственному этапу»), срок —
 * срок родителя, поиск — номер/произвольный номер/заказчик родителя и
 * название допечатки.
 *
 * @param {object} reprint
 * @param {object} f — { statuses?: string[], search?: string,
 *                       deadlineFrom?: string, deadlineTo?: string }
 */
export function matchesReprintFilters(reprint, f = {}) {
  if (!reprint) return false
  const { statuses, search, deadlineFrom, deadlineTo } = f
  if (Array.isArray(statuses) && statuses.length > 0 && !statuses.includes(reprint.status)) {
    return false
  }
  const deadline = reprint.order?.deadline || null
  if (deadlineFrom && (!deadline || deadline < deadlineFrom)) return false
  if (deadlineTo && (!deadline || deadline > deadlineTo)) return false

  const q = (search || '').trim().toLowerCase()
  if (q) {
    const order = reprint.order || {}
    const hay = [
      String(order.number ?? ''),
      order.custom_number || '',
      order.client?.name || '',
      reprint.title || '',
    ].map((s) => String(s).toLowerCase())
    const num = parseInt(q, 10)
    const numberHit = !isNaN(num) && String(num) === q && Number(order.number) === num
    if (!numberHit && !hay.some((h) => h.includes(q))) return false
  }
  return true
}

/**
 * Раскладывает допечатки «сразу после родителя».
 * Допечатки, чей родитель отсутствует в orders (скрыт фильтром/другой страницей),
 * попадают в хвост списка, если includeOrphans=true.
 *
 * @returns {Array<{kind:'order', order} | {kind:'reprint', reprint}>}
 */
export function interleaveReprints(orders, reprints, { includeOrphans = true } = {}) {
  const byOrder = new Map()
  for (const r of reprints || []) {
    const oid = r.order?.id || r.order_id
    if (!oid) continue
    if (!byOrder.has(oid)) byOrder.set(oid, [])
    byOrder.get(oid).push(r)
  }
  for (const list of byOrder.values()) {
    list.sort((a, b) => (a.item_idx ?? 0) - (b.item_idx ?? 0))
  }
  const out = []
  const placed = new Set()
  for (const o of orders || []) {
    out.push({ kind: 'order', order: o })
    const list = byOrder.get(o.id)
    if (list) {
      for (const r of list) out.push({ kind: 'reprint', reprint: r })
      placed.add(o.id)
    }
  }
  if (includeOrphans) {
    for (const [oid, list] of byOrder.entries()) {
      if (placed.has(oid)) continue
      for (const r of list) out.push({ kind: 'reprint', reprint: r })
    }
  }
  return out
}

/**
 * Ревью R25 (п.18): попадает ли сам заказ-родитель в выборку страницы
 * (те же фильтры, что серверный запрос useOrders: статус, срок, поиск по
 * номеру / произвольному номеру / заказчику). Если да — родитель стоит на
 * какой-то странице, и допечатка показывается только рядом с ним; иначе
 * она «сирота» и выводится на первой странице.
 */
export function parentMatchesOrderFilters(order, f = {}) {
  if (!order) return false
  const { statuses, search, deadlineFrom, deadlineTo } = f
  if (Array.isArray(statuses) && statuses.length > 0 && !statuses.includes(order.status)) return false
  const deadline = order.deadline || null
  if (deadlineFrom && (!deadline || deadline < deadlineFrom)) return false
  if (deadlineTo && (!deadline || deadline > deadlineTo)) return false
  const q = (search || '').trim().toLowerCase()
  if (q) {
    const num = parseInt(q, 10)
    const numberHit = !isNaN(num) && Number(order.number) === num
    const hay = [order.custom_number || '', order.client?.name || ''].map((s) => String(s).toLowerCase())
    if (!numberHit && !hay.some((h) => h.includes(q))) return false
  }
  return true
}

/**
 * Ревью R25 (п.18): допечатки текущей страницы списка без дублей.
 * Раньше на первой странице выводились все допечатки, чей родитель не на
 * ней, — и та же допечатка повторялась на странице родителя. Теперь:
 *   • рядом с родителем, если он на этой странице;
 *   • на первой странице — только если родитель не попадает в выборку
 *     вовсе.
 *
 * @param {Array} reprints — уже отфильтрованные matchesReprintFilters
 * @param {Array} pageOrders — заказы текущей страницы
 * @param {{ isFirstPage: boolean, filters: object }} opts
 */
export function selectPageReprints(reprints, pageOrders, { isFirstPage = true, filters = {} } = {}) {
  const pageIds = new Set((pageOrders || []).map((o) => o.id))
  return (reprints || []).filter((r) => {
    const oid = r.order?.id || r.order_id
    if (pageIds.has(oid)) return true
    if (!isFirstPage) return false
    return !parentMatchesOrderFilters(r.order, filters)
  })
}

/** Карта orderId → число активных допечаток (для чипа «Допечаток: N»). */
export function countActiveReprintsByOrder(reprints) {
  const map = {}
  for (const r of reprints || []) {
    if (!isActiveReprint(r)) continue
    const oid = r.order?.id || r.order_id
    if (!oid) continue
    map[oid] = (map[oid] || 0) + 1
  }
  return map
}

/** Группирует допечатки по их собственному этапу (колонки канбана). */
export function groupReprintsByStatus(reprints) {
  const out = {}
  for (const r of reprints || []) {
    if (!out[r.status]) out[r.status] = []
    out[r.status].push(r)
  }
  return out
}

/** Счётчик колонки канбана: «12» или «12 + 2 доп.». */
export function formatColumnCount(ordersCount, reprintsCount) {
  const o = Number(ordersCount) || 0
  const r = Number(reprintsCount) || 0
  return r > 0 ? `${o} + ${r} доп.` : String(o)
}

/**
 * Бейдж вкладки «Подзадачи» (ТЗ 3.3): акцент + число активных, если есть;
 * серый + общее число, если все завершены; null — подзадач нет.
 * @param {Array<{status:string}>} reprints
 */
export function reprintTabBadge(reprints) {
  const list = reprints || []
  if (list.length === 0) return null
  const active = list.filter(isActiveReprint).length
  if (active > 0) return { count: active, tone: 'accent' }
  return { count: list.length, tone: 'muted' }
}

/**
 * Элемент календаря для допечатки: по сроку родителя, с пометкой «Д».
 */
export function reprintToCalendarItem(reprint) {
  const order = reprint.order || {}
  return {
    id: `reprint-${reprint.id}`,
    isReprint: true,
    href: `/production/subtask/${reprint.id}`,
    number: order.number,
    custom_number: order.custom_number,
    order_type: order.order_type,
    deadline: order.deadline,
    status: reprint.status,
    qty: reprint.qty,
    priority: order.priority,
    client: order.client,
    title: reprintDisplayTitle(reprint, orderNumberText(order)),
  }
}
