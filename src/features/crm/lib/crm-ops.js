// R28.3 — операции CRM: слияние, глобальный поиск, импорт/экспорт.
import { supabase } from '@/shared/lib/supabase'
import { escapeIlikePattern } from '@/features/clients/hooks/useClients'
import { createCompany, createContact } from './crm-api'
import { contactFullName } from './client-metrics'

export async function mergeClients(keepId, dropId) {
  const { data, error } = await supabase.rpc('crm_merge_clients', { p_keep: keepId, p_drop: dropId })
  if (error) throw error
  return data
}

export async function mergeContacts(keepId, dropId) {
  const { data, error } = await supabase.rpc('crm_merge_contacts', { p_keep: keepId, p_drop: dropId })
  if (error) throw error
  return data
}

async function fetchPaged(build) {
  const out = []
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

/** Все действующие клиенты (сверка дублей при импорте). */
export function listAllClientsBrief() {
  return fetchPaged(() => supabase.from('k24_clients').select('id, name, inn').is('merged_into', null).order('created_at'))
}

/** Данные для выгрузки: клиенты + их контакты с каналами связи. */
export async function fetchExportData() {
  const clients = await fetchPaged(() => supabase
    .from('k24_clients')
    .select('id, name, kind, inn, phone, email, website, source, comment, created_at')
    .is('merged_into', null).is('archived_at', null).order('name'))
  const contacts = await fetchPaged(() => supabase
    .from('k24_contacts')
    .select('id, client_id, first_name, last_name, position, identities:k24_contact_identities(kind, value)')
    .is('merged_into', null).is('archived_at', null).not('client_id', 'is', null).order('created_at'))
  const contactsByClient = {}
  for (const c of contacts) (contactsByClient[c.client_id] ||= []).push(c)
  return { clients, contactsByClient }
}

/**
 * Применить план импорта (planImport) последовательно; ошибки строк не
 * останавливают остальное. onProgress(done, total).
 */
export async function applyImport(items, onProgress) {
  const newIdByKey = new Map()
  let createdClients = 0
  let createdContacts = 0
  const failed = []
  let done = 0
  for (const it of items) {
    try {
      if (it.action === 'skip') continue
      let clientId = null
      if (it.action === 'attach') clientId = it.existingId
      if (it.action === 'create') {
        const c = await createCompany(it.company)
        newIdByKey.set(it.fileKey, c.id)
        clientId = c.id
        createdClients += 1
      }
      if (it.action === 'attach_new') clientId = newIdByKey.get(it.fileKey) || null
      if (it.contact) {
        await createContact({ ...it.contact, client_id: clientId }, it.contact.identities)
        createdContacts += 1
      }
    } catch (err) {
      failed.push({ line: it.line, message: err?.message || String(err) })
    } finally {
      done += 1
      onProgress?.(done, items.length)
    }
  }
  return { createdClients, createdContacts, failed }
}

/**
 * Глобальный поиск (Ctrl+K): клиенты, контакты (и по телефону/email), сделки, заказы.
 * @returns {Array<{ type, id, title, subtitle, to }>}
 */
export async function globalSearch(raw) {
  const q = escapeIlikePattern(String(raw || '').replace(/[,()]/g, ' ').trim())
  if (q.length < 2) return []
  const digits = String(raw).replace(/\D/g, '')
  const isNumber = /^\d+$/.test(q)

  const [clients, identities, contacts, deals, orders] = await Promise.all([
    supabase.from('k24_clients').select('id, name, inn').is('merged_into', null)
      .or(`name.ilike.%${q}%,inn.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`).limit(6),
    digits.length >= 4 || q.includes('@')
      ? supabase.from('k24_contact_identities')
        .select('value, contact:k24_contacts(id, first_name, last_name, client_id, merged_into, client:k24_clients(name))')
        .ilike('value_norm', `%${digits.length >= 4 ? digits : q.toLowerCase()}%`).limit(6)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('k24_contacts').select('id, first_name, last_name, client_id, client:k24_clients(name)')
      .is('merged_into', null).or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`).limit(6),
    supabase.from('k24_deals').select('id, number, title, client:k24_clients(name)')
      .or(`title.ilike.%${q}%${isNumber ? `,number.eq.${q}` : ''}`).limit(6),
    supabase.from('k24_orders_full').select('id, number, custom_number, deal_name')
      .or(`custom_number.ilike.%${q}%,deal_name.ilike.%${q}%${isNumber ? `,number.eq.${q}` : ''}`)
      .order('created_at', { ascending: false }).limit(6),
  ])
  for (const r of [clients, identities, contacts, deals, orders]) if (r.error) throw r.error

  const results = []
  for (const c of clients.data || []) {
    results.push({ type: 'Клиент', id: `c:${c.id}`, title: c.name, subtitle: c.inn ? `ИНН ${c.inn}` : '', to: `/crm/clients/${c.id}` })
  }
  const seenContacts = new Set()
  const pushContact = (p, extra = '') => {
    if (!p || p.merged_into || seenContacts.has(p.id)) return
    seenContacts.add(p.id)
    results.push({
      type: 'Контакт', id: `p:${p.id}`, title: contactFullName(p),
      subtitle: [p.client?.name, extra].filter(Boolean).join(' · '),
      to: p.client_id ? `/crm/clients/${p.client_id}` : '/crm/clients?tab=contacts',
    })
  }
  for (const i of identities.data || []) pushContact(i.contact, i.value)
  for (const p of contacts.data || []) pushContact(p)
  for (const d of deals.data || []) {
    results.push({ type: 'Сделка', id: `d:${d.id}`, title: `№ ${d.number} ${d.title}`, subtitle: d.client?.name || '', to: `/crm/deals/${d.id}` })
  }
  for (const o of orders.data || []) {
    results.push({ type: 'Заказ', id: `o:${o.id}`, title: `№ ${o.custom_number || o.number}`, subtitle: o.deal_name || '', to: `/orders/${o.id}` })
  }
  return results
}
