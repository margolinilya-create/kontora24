// R28.0 — доступ к данным CRM (компании k24_clients, контакты, каналы связи).
// Все функции бросают ошибку Supabase как есть — вызывающий код показывает
// toast.error(translateError(err).message).
import { supabase } from '@/shared/lib/supabase'
import { escapeIlikePattern, normalizeClientName } from '@/features/clients/hooks/useClients'
import { prepareIdentities } from './identity'
import { diffIdentities } from './identity-diff'

export const PAGE_SIZE = 50

const COMPANY_COLUMNS =
  'id, name, kind, inn, website, phone, email, comment, tags, source, owner_id, archived_at, created_at, updated_at'

// Поиск: убираем символы, ломающие синтаксис .or() PostgREST, и экранируем ilike.
function searchTerm(raw) {
  return escapeIlikePattern(String(raw || '').replace(/[,()]/g, ' ').trim())
}

// ---------------------------------------------------------------------------
// Компании
// ---------------------------------------------------------------------------

export async function listCompanies({ search = '', kind = 'all', archived = false, page = 1 } = {}) {
  let q = supabase
    .from('k24_clients')
    .select(`${COMPANY_COLUMNS}, contacts:k24_contacts(count)`, { count: 'exact' })
    .is('merged_into', null)
    .order('name')
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
  if (kind !== 'all') q = q.eq('kind', kind)
  const s = searchTerm(search)
  if (s) q = q.or(`name.ilike.%${s}%,inn.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`)
  const { data, error, count } = await q
  if (error) throw error
  return {
    rows: (data || []).map((c) => ({ ...c, contacts_count: c.contacts?.[0]?.count ?? 0 })),
    total: count ?? 0,
  }
}

export async function getCompany(id) {
  const { data, error } = await supabase
    .from('k24_clients')
    .select(COMPANY_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

function companyPayload(values) {
  return {
    name: normalizeClientName(values.name),
    kind: values.kind === 'person' ? 'person' : 'company',
    inn: values.inn ? String(values.inn).replace(/\D/g, '') || null : null,
    website: values.website?.trim() || null,
    phone: values.phone?.trim() || null,
    email: values.email?.trim() || null,
    comment: values.comment?.trim() || null,
    source: values.source || null,
    owner_id: values.owner_id || null,
  }
}

export async function createCompany(values) {
  const { data, error } = await supabase
    .from('k24_clients')
    .insert({ ...companyPayload(values), tags: [] })
    .select(COMPANY_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function updateCompany(id, values) {
  const { data, error } = await supabase
    .from('k24_clients')
    .update({ ...companyPayload(values), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COMPANY_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function setCompanyArchived(id, archived) {
  const { error } = await supabase
    .from('k24_clients')
    .update({ archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Заказы компании — через маскирующее view (финансы NULL без view:finance). */
export async function listCompanyOrders(clientId) {
  const { data, error } = await supabase
    .from('k24_orders_full')
    .select('id, number, custom_number, status, order_type, product_name, qty, deadline, created_at, price_final, deal_name')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data || []
}

// ---------------------------------------------------------------------------
// Контакты
// ---------------------------------------------------------------------------

const CONTACT_SELECT =
  'id, client_id, first_name, last_name, position, notes, owner_id, archived_at, created_at, updated_at, ' +
  'client:k24_clients(id, name), identities:k24_contact_identities(id, kind, value, value_norm, is_primary)'

export async function listContacts({ search = '', clientId = null, archived = false, page = 1 } = {}) {
  let q = supabase
    .from('k24_contacts')
    .select(CONTACT_SELECT, { count: 'exact' })
    .is('merged_into', null)
    .order('first_name')
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
  if (clientId) q = q.eq('client_id', clientId)

  const s = searchTerm(search)
  if (s) {
    // Совпадения по каналам связи (телефон — и по цифрам: «999 12» найдёт +7999 12…).
    const digits = String(search).replace(/\D/g, '')
    const identityOr = [`value_norm.ilike.%${s.toLowerCase()}%`]
    if (digits.length >= 4) identityOr.push(`value_norm.ilike.%${digits}%`)
    const { data: hits, error: hitErr } = await supabase
      .from('k24_contact_identities')
      .select('contact_id')
      .or(identityOr.join(','))
      .limit(200)
    if (hitErr) throw hitErr
    const ids = [...new Set((hits || []).map((h) => h.contact_id))]
    const parts = [`first_name.ilike.%${s}%`, `last_name.ilike.%${s}%`, `position.ilike.%${s}%`]
    if (ids.length) parts.push(`id.in.(${ids.join(',')})`)
    q = q.or(parts.join(','))
  }

  const { data, error, count } = await q
  if (error) throw error
  return { rows: data || [], total: count ?? 0 }
}

function contactPayload(values) {
  return {
    first_name: String(values.first_name || '').trim(),
    last_name: values.last_name?.trim() || null,
    position: values.position?.trim() || null,
    notes: values.notes?.trim() || null,
    client_id: values.client_id || null,
    owner_id: values.owner_id || null,
  }
}

async function applyIdentityDiff(contactId, existing, rows) {
  const { toInsert, toUpdate, toDelete } = diffIdentities(existing, prepareIdentities(rows))
  if (toInsert.length) {
    const { error } = await supabase
      .from('k24_contact_identities')
      .insert(toInsert.map((r) => ({ ...r, contact_id: contactId })))
    if (error) throw error
  }
  for (const { id, patch } of toUpdate) {
    const { error } = await supabase.from('k24_contact_identities').update(patch).eq('id', id)
    if (error) throw error
  }
  if (toDelete.length) {
    const { error } = await supabase.from('k24_contact_identities').delete().in('id', toDelete)
    if (error) throw error
  }
}

export async function createContact(values, identityRows) {
  const { data, error } = await supabase
    .from('k24_contacts')
    .insert(contactPayload(values))
    .select('id')
    .single()
  if (error) throw error
  await applyIdentityDiff(data.id, [], identityRows)
  return data
}

export async function updateContact(id, values, identityRows, existingIdentities) {
  const { error } = await supabase.from('k24_contacts').update(contactPayload(values)).eq('id', id)
  if (error) throw error
  await applyIdentityDiff(id, existingIdentities || [], identityRows)
}

export async function setContactArchived(id, archived) {
  const { error } = await supabase
    .from('k24_contacts')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Поиск дублей (предупреждение в формах, не блокирует сохранение)
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<Array<{ type: 'company'|'contact', id, label, reason, clientId? }>>}
 */
export async function findDuplicates({ companyName = '', inn = '', identities = [], excludeCompanyId = null, excludeContactId = null }) {
  const found = []

  const name = normalizeClientName(companyName)
  const innDigits = String(inn || '').replace(/\D/g, '')
  if (name || innDigits) {
    const parts = []
    if (name) parts.push(`name.ilike.${escapeIlikePattern(name.replace(/[,()]/g, ' '))}`)
    if (innDigits) parts.push(`inn.eq.${innDigits}`)
    let q = supabase.from('k24_clients').select('id, name, inn').is('merged_into', null).or(parts.join(',')).limit(5)
    if (excludeCompanyId) q = q.neq('id', excludeCompanyId)
    const { data, error } = await q
    if (error) throw error
    for (const c of data || []) {
      const byInn = innDigits && c.inn === innDigits
      found.push({ type: 'company', id: c.id, label: c.name, reason: byInn ? 'тот же ИНН' : 'то же название' })
    }
  }

  const norms = prepareIdentities(identities).map((r) => r.value_norm)
  if (norms.length) {
    const { data, error } = await supabase
      .from('k24_contact_identities')
      .select('kind, value_norm, contact:k24_contacts(id, first_name, last_name, client_id, merged_into)')
      .in('value_norm', norms)
      .limit(10)
    if (error) throw error
    const seen = new Set()
    for (const row of data || []) {
      const c = row.contact
      if (!c || c.merged_into || c.id === excludeContactId || seen.has(c.id)) continue
      seen.add(c.id)
      found.push({
        type: 'contact',
        id: c.id,
        clientId: c.client_id,
        label: [c.first_name, c.last_name].filter(Boolean).join(' '),
        reason: row.kind === 'phone' ? 'тот же телефон' : row.kind === 'email' ? 'тот же email' : 'тот же контакт',
      })
    }
  }
  return found
}
