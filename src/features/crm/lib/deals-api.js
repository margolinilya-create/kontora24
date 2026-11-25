// R28.1 — доступ к данным сделок, воронок и справочников CRM.
import { supabase } from '@/shared/lib/supabase'
import { escapeIlikePattern } from '@/features/clients/hooks/useClients'

const DEAL_COLUMNS =
  'id, number, title, pipeline_id, stage_id, client_id, contact_id, owner_id, amount, expected_close, ' +
  'source, notes, lost_reason_id, lost_comment, stage_changed_at, closed_at, archived_at, created_at, updated_at'

const DEAL_LIST_SELECT = `${DEAL_COLUMNS}, client:k24_clients(id, name), contact:k24_contacts(id, first_name, last_name)`

// ---------------------------------------------------------------------------
// Воронки / этапы / причины
// ---------------------------------------------------------------------------

export async function listPipelines() {
  const { data, error } = await supabase
    .from('k24_crm_pipelines')
    .select('id, name, sort, is_default, archived_at, stages:k24_crm_stages(id, pipeline_id, name, color, sort, probability, kind, rot_days, archived_at)')
    .order('sort')
  if (error) throw error
  return (data || []).map((p) => ({
    ...p,
    stages: [...(p.stages || [])].sort((a, b) => a.sort - b.sort),
  }))
}

export async function listLostReasons({ includeArchived = false } = {}) {
  let q = supabase.from('k24_crm_lost_reasons').select('id, name, sort, archived_at').order('sort')
  if (!includeArchived) q = q.is('archived_at', null)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

/** Новая воронка сразу с минимальным набором этапов (открытый / выиграна / проиграна). */
export async function createPipeline(name, sort) {
  const { data, error } = await supabase
    .from('k24_crm_pipelines')
    .insert({ name: String(name || '').trim(), sort: Number(sort) || 0 })
    .select('id')
    .single()
  if (error) throw error
  const { error: stErr } = await supabase.from('k24_crm_stages').insert([
    { pipeline_id: data.id, name: 'Новая', color: '#60A5FA', sort: 1, probability: 10, kind: 'open', rot_days: 3 },
    { pipeline_id: data.id, name: 'Выиграна', color: '#22C55E', sort: 90, probability: 100, kind: 'won' },
    { pipeline_id: data.id, name: 'Проиграна', color: '#EF4444', sort: 99, probability: 0, kind: 'lost' },
  ])
  if (stErr) throw stErr
  return data
}

export async function renamePipeline(id, name) {
  const { error } = await supabase.from('k24_crm_pipelines').update({ name: String(name || '').trim() }).eq('id', id)
  if (error) throw error
}

export async function saveStage(stage) {
  const payload = {
    pipeline_id: stage.pipeline_id,
    name: String(stage.name || '').trim(),
    color: stage.color || '#9CA3AF',
    sort: Number(stage.sort) || 0,
    probability: Math.max(0, Math.min(100, Number(stage.probability) || 0)),
    kind: stage.kind || 'open',
    rot_days: stage.rot_days ? Number(stage.rot_days) : null,
  }
  const q = stage.id
    ? supabase.from('k24_crm_stages').update(payload).eq('id', stage.id)
    : supabase.from('k24_crm_stages').insert(payload)
  const { error } = await q
  if (error) throw error
}

/** Архив этапа: сделки на нём остаются, новые туда не попадают. */
export async function setStageArchived(id, archived) {
  const { error } = await supabase
    .from('k24_crm_stages')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

export async function saveLostReason(reason) {
  const payload = { name: String(reason.name || '').trim(), sort: Number(reason.sort) || 0 }
  const q = reason.id
    ? supabase.from('k24_crm_lost_reasons').update(payload).eq('id', reason.id)
    : supabase.from('k24_crm_lost_reasons').insert(payload)
  const { error } = await q
  if (error) throw error
}

export async function setLostReasonArchived(id, archived) {
  const { error } = await supabase
    .from('k24_crm_lost_reasons')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Сделки
// ---------------------------------------------------------------------------

export async function listDeals({ pipelineId = null, search = '', clientId = null, includeArchived = false } = {}) {
  let q = supabase.from('k24_deals').select(DEAL_LIST_SELECT).order('updated_at', { ascending: false }).limit(1000)
  if (pipelineId) q = q.eq('pipeline_id', pipelineId)
  if (clientId) q = q.eq('client_id', clientId)
  if (!includeArchived) q = q.is('archived_at', null)
  const s = escapeIlikePattern(String(search || '').replace(/[,()]/g, ' ').trim())
  if (s) {
    const asNumber = /^\d+$/.test(s) ? `,number.eq.${s}` : ''
    q = q.or(`title.ilike.%${s}%${asNumber}`)
  }
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function getDeal(id) {
  const { data, error } = await supabase
    .from('k24_deals')
    .select(`${DEAL_LIST_SELECT}, lost_reason:k24_crm_lost_reasons(id, name)`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Заказы сделки — через маскирующее view. */
export async function listDealOrders(dealId) {
  const { data, error } = await supabase
    .from('k24_orders_full')
    .select('id, number, custom_number, status, order_type, product_name, qty, deadline, created_at, price_final, deal_name')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

function dealPayload(values) {
  const amount = values.amount === '' || values.amount == null ? null : Number(values.amount)
  return {
    title: String(values.title || '').trim(),
    stage_id: values.stage_id,
    pipeline_id: values.pipeline_id,
    client_id: values.client_id || null,
    contact_id: values.contact_id || null,
    owner_id: values.owner_id || null,
    amount: Number.isFinite(amount) ? amount : null,
    expected_close: values.expected_close || null,
    source: values.source || null,
    notes: values.notes?.trim() || null,
  }
}

export async function createDeal(values) {
  const { data, error } = await supabase.from('k24_deals').insert(dealPayload(values)).select('id, number').single()
  if (error) throw error
  return data
}

/** Правка полей сделки без смены этапа (этап — только через moveDeal). */
export async function updateDeal(id, values) {
  const { stage_id: _s, pipeline_id: _p, ...rest } = dealPayload(values)
  const { error } = await supabase.from('k24_deals').update(rest).eq('id', id)
  if (error) throw error
}

/**
 * Перенос сделки на этап. Для «проиграна» — причина/комментарий.
 * Оптимистичная проверка `.eq('stage_id', fromStageId)`: если сделку уже
 * передвинул другой менеджер — 0 строк → ошибка, доска перезагрузится.
 */
export async function moveDeal(id, fromStageId, toStageId, { lostReasonId = null, lostComment = null } = {}) {
  const patch = { stage_id: toStageId }
  if (lostReasonId) {
    patch.lost_reason_id = lostReasonId
    patch.lost_comment = lostComment?.trim() || null
  }
  const { data, error } = await supabase
    .from('k24_deals')
    .update(patch)
    .eq('id', id)
    .eq('stage_id', fromStageId)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Сделку уже изменили — обновите доску')
}

export async function setDealArchived(id, archived) {
  const { error } = await supabase
    .from('k24_deals')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}
