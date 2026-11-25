// R28.2 — чистые функции ленты активности и задач.

export const TASK_KINDS = {
  call: { label: 'Звонок', icon: '☎' },
  email: { label: 'Письмо', icon: '✉' },
  meeting: { label: 'Встреча', icon: '◎' },
  todo: { label: 'Дело', icon: '✓' },
}

export const FEED_FILTERS = [
  { key: 'all', label: 'Всё' },
  { key: 'note', label: 'Заметки' },
  { key: 'task', label: 'Задачи' },
  { key: 'deal', label: 'Сделки' },
  { key: 'order', label: 'Заказы' },
]

/**
 * Единая лента из разных источников.
 * @returns {Array<{ key, type: 'note'|'task'|'deal'|'order', at: string, pinned?: boolean, data }>}
 *   Закреплённые заметки — сверху, остальное — по времени, новые первыми.
 */
export function buildFeed({ notes = [], tasks = [], activities = [], statusHistory = [], ordersById = {} } = {}) {
  const items = []
  for (const n of notes) items.push({ key: `n:${n.id}`, type: 'note', at: n.created_at, pinned: !!n.pinned, data: n })
  for (const t of tasks) items.push({ key: `t:${t.id}`, type: 'task', at: t.done_at || t.created_at, pinned: false, data: t })
  for (const a of activities) items.push({ key: `a:${a.id}`, type: 'deal', at: a.occurred_at, pinned: false, data: a })
  for (const h of statusHistory) {
    items.push({ key: `h:${h.id}`, type: 'order', at: h.created_at, pinned: false, data: { ...h, order: ordersById[h.order_id] || null } })
  }
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.at) - new Date(a.at)
  })
  return items
}

export function filterFeed(items, filter) {
  if (!filter || filter === 'all') return items
  return items.filter((i) => i.type === filter)
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Корзина задачи для подсветки: красный — просрочена, оранжевый — сегодня. */
export function taskBucket(task, now = new Date()) {
  if (task.done_at) return 'done'
  if (!task.due_at) return 'nodate'
  const due = new Date(task.due_at)
  if (due < now) return 'overdue'
  if (dayKey(due) === dayKey(now)) return 'today'
  return 'upcoming'
}

/** Открытые задачи по порядку: просроченные → сегодня → будущие → без срока. */
export function sortOpenTasks(tasks, now = new Date()) {
  const rank = { overdue: 0, today: 1, upcoming: 2, nodate: 3, done: 4 }
  return [...(tasks || [])]
    .filter((t) => !t.done_at)
    .sort((a, b) => {
      const ra = rank[taskBucket(a, now)]
      const rb = rank[taskBucket(b, now)]
      if (ra !== rb) return ra - rb
      return new Date(a.due_at || 8.64e15) - new Date(b.due_at || 8.64e15)
    })
}

/** Открытые сделки без единой открытой задачи — «нет следующего шага». */
export function dealsWithoutNextStep(deals, openTaskDealIds, stagesById) {
  const withTask = new Set(openTaskDealIds || [])
  return (deals || []).filter((d) => stagesById[d.stage_id]?.kind === 'open' && !d.archived_at && !withTask.has(d.id))
}

/** Задачи, срок которых наступил, но о которых ещё не напоминали. */
export function dueForReminder(tasks, notifiedIds, now = new Date()) {
  const seen = new Set(notifiedIds || [])
  return (tasks || []).filter((t) => !t.done_at && t.due_at && new Date(t.due_at) <= now && !seen.has(t.id))
}

/** datetime-local (локальное время) → ISO; пусто/мусор → null. */
export function localInputToIso(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Значение для <input type="datetime-local"> на N часов вперёд от now, ровный час. */
export function defaultDueInput(now = new Date(), hoursAhead = 2) {
  const d = new Date(now.getTime() + hoursAhead * 3600 * 1000)
  d.setMinutes(0, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
}
