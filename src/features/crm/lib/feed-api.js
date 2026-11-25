// R28.2 — доступ к заметкам, задачам и ленте событий CRM.
import { supabase } from '@/shared/lib/supabase'

const NOTE_COLS = 'id, body, pinned, mentions, client_id, contact_id, deal_id, author_id, created_at, updated_at'
const TASK_COLS = 'id, title, kind, due_at, done_at, assignee_id, client_id, contact_id, deal_id, notes, created_by, created_at, updated_at'
const TASK_LIST_SELECT = `${TASK_COLS}, deal:k24_deals(id, number, title), client:k24_clients(id, name)`

function scope(q, { clientId, dealId }) {
  if (dealId) return q.eq('deal_id', dealId)
  if (clientId) return q.eq('client_id', clientId)
  throw new Error('Не указан клиент или сделка')
}

// ---------------------------------------------------------------------------
// Заметки
// ---------------------------------------------------------------------------

export async function listNotes(target) {
  const { data, error } = await scope(supabase.from('k24_crm_notes').select(NOTE_COLS), target)
    .order('created_at', { ascending: false }).limit(300)
  if (error) throw error
  return data || []
}

export async function createNote({ body, mentions = [], clientId = null, dealId = null, contactId = null }) {
  const { error } = await supabase.from('k24_crm_notes').insert({
    body: String(body || '').trim(), mentions, client_id: clientId, deal_id: dealId, contact_id: contactId,
  })
  if (error) throw error
}

export async function updateNote(id, patch) {
  const { error } = await supabase.from('k24_crm_notes').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteNote(id) {
  const { error } = await supabase.from('k24_crm_notes').delete().eq('id', id)
  if (error) throw error
}

/** Заметки, где упомянут пользователь (за N дней) — для главной. */
export async function listMentions(userId, days = 7) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('k24_crm_notes')
    .select(`${NOTE_COLS}, deal:k24_deals(id, number, title), client:k24_clients(id, name)`)
    .contains('mentions', [userId])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data || []
}

// ---------------------------------------------------------------------------
// Задачи
// ---------------------------------------------------------------------------

export async function listTasks(target) {
  const { data, error } = await scope(supabase.from('k24_crm_tasks').select(TASK_LIST_SELECT), target)
    .order('created_at', { ascending: false }).limit(300)
  if (error) throw error
  return data || []
}

export async function listMyOpenTasks(userId) {
  const { data, error } = await supabase
    .from('k24_crm_tasks')
    .select(TASK_LIST_SELECT)
    .eq('assignee_id', userId)
    .is('done_at', null)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(200)
  if (error) throw error
  return data || []
}

/** id сделок, у которых есть хотя бы одна открытая задача. */
export async function listOpenTaskDealIds(dealIds) {
  if (!dealIds?.length) return []
  const { data, error } = await supabase
    .from('k24_crm_tasks')
    .select('deal_id')
    .in('deal_id', dealIds.slice(0, 500))
    .is('done_at', null)
  if (error) throw error
  return [...new Set((data || []).map((r) => r.deal_id))]
}

export async function createTask({ title, kind = 'todo', dueAt = null, assigneeId = null, clientId = null, dealId = null, contactId = null, notes = null }) {
  const { error } = await supabase.from('k24_crm_tasks').insert({
    title: String(title || '').trim(), kind, due_at: dueAt, assignee_id: assigneeId,
    client_id: clientId, deal_id: dealId, contact_id: contactId, notes: notes?.trim() || null,
  })
  if (error) throw error
}

export async function setTaskDone(id, done) {
  const { error } = await supabase.from('k24_crm_tasks').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id)
  if (error) throw error
}

export async function deleteTask(id) {
  const { error } = await supabase.from('k24_crm_tasks').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Лента: события сделок + история статусов заказов
// ---------------------------------------------------------------------------

export async function listActivities(target) {
  const { data, error } = await scope(
    supabase.from('k24_activities').select('id, kind, occurred_at, actor_id, client_id, deal_id, order_id, summary, meta'),
    target,
  ).order('occurred_at', { ascending: false }).limit(300)
  if (error) throw error
  return data || []
}

/** История статусов заказов (существующая таблица производства, только чтение). */
export async function listOrderHistory(orderIds) {
  if (!orderIds?.length) return []
  const { data, error } = await supabase
    .from('k24_order_status_history')
    .select('id, order_id, from_status, to_status, kind, note, changed_by, created_at')
    .in('order_id', orderIds.slice(0, 200))
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data || []
}

/** R28.4: смены этапов сделок (для воронки), не больше 5000 последних. */
export async function listStageActivities(since = null) {
  let q = supabase.from('k24_activities').select('deal_id, meta, occurred_at').eq('kind', 'deal_stage')
    .order('occurred_at', { ascending: false }).limit(5000)
  if (since) q = q.gte('occurred_at', since)
  const { data, error } = await q
  if (error) throw error
  return data || []
}
