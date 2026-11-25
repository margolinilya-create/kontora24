// R28.3 — импорт базы клиентов из Excel/CSV (чистые функции).
import { normalizeClientName } from '@/features/clients/hooks/useClients'
import { normalizePhone, normalizeEmail, normalizeTelegram } from './identity'

// Поле → варианты заголовков (сравнение без регистра/пробелов/ё).
const HEADER_SYNONYMS = {
  company: ['компания', 'клиент', 'название', 'организация', 'наименование', 'заказчик'],
  kind: ['тип', 'типклиента'],
  inn: ['инн'],
  company_phone: ['телефонкомпании', 'общийтелефон'],
  company_email: ['emailкомпании', 'почтакомпании', 'общийemail'],
  website: ['сайт'],
  source: ['источник'],
  comment: ['комментарий', 'примечание'],
  contact: ['контакт', 'контактноелицо', 'фио', 'имя'],
  position: ['должность'],
  phone: ['телефон', 'телефонконтакта', 'мобильный', 'тел'],
  email: ['email', 'почта', 'emailконтакта', 'эл.почта', 'электроннаяпочта'],
  telegram: ['telegram', 'телеграм', 'tg'],
}

const SOURCE_BY_LABEL = {
  'референт': 'referrer', 'авито': 'avito', 'сайт': 'website',
  'сарафан': 'word_of_mouth', 'повторный заказ': 'repeat', 'другой': 'other',
}

function key(s) {
  return String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[\s_\-:]/g, '')
}

/** Заголовки → { field: columnIndex }. Неизвестные колонки игнорируются. */
export function mapHeaders(headerRow) {
  const map = {}
  ;(headerRow || []).forEach((h, idx) => {
    const k = key(h)
    if (!k) return
    for (const [field, variants] of Object.entries(HEADER_SYNONYMS)) {
      if (map[field] === undefined && variants.some((v) => key(v) === k)) {
        map[field] = idx
        return
      }
    }
  })
  return map
}

function cell(row, idx) {
  if (idx === undefined) return ''
  return String(row?.[idx] ?? '').trim()
}

function splitName(full) {
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { first_name: parts[0] || '', last_name: '' }
  // «Иванов Иван» — частый порядок в выгрузках: фамилия первой при 2+ словах.
  return { last_name: parts[0], first_name: parts.slice(1).join(' ') }
}

/**
 * Строки таблицы → записи импорта.
 * @returns {Array<{ line, company?, contact?, errors: string[] }>}
 */
export function parseRows(rows, map) {
  const out = []
  ;(rows || []).forEach((row, i) => {
    const companyName = normalizeClientName(cell(row, map.company))
    const contactName = normalizeClientName(cell(row, map.contact))
    const phoneRaw = cell(row, map.phone)
    const emailRaw = cell(row, map.email)
    const tgRaw = cell(row, map.telegram)
    if (!companyName && !contactName && !phoneRaw && !emailRaw) return // пустая строка

    const errors = []
    const identities = []
    if (phoneRaw) {
      if (normalizePhone(phoneRaw)) identities.push({ kind: 'phone', value: phoneRaw, is_primary: true })
      else errors.push(`телефон «${phoneRaw}» не распознан`)
    }
    if (emailRaw) {
      if (normalizeEmail(emailRaw)) identities.push({ kind: 'email', value: emailRaw, is_primary: true })
      else errors.push(`email «${emailRaw}» не распознан`)
    }
    if (tgRaw) {
      if (normalizeTelegram(tgRaw)) identities.push({ kind: 'telegram', value: tgRaw, is_primary: true })
      else errors.push(`Telegram «${tgRaw}» не распознан`)
    }

    const kindRaw = key(cell(row, map.kind))
    const company = companyName
      ? {
          name: companyName,
          kind: kindRaw.startsWith('физ') ? 'person' : 'company',
          inn: cell(row, map.inn).replace(/\D/g, '') || null,
          phone: cell(row, map.company_phone) || null,
          email: cell(row, map.company_email) || null,
          website: cell(row, map.website) || null,
          source: SOURCE_BY_LABEL[cell(row, map.source).toLowerCase()] || null,
          comment: cell(row, map.comment) || null,
        }
      : null

    let contact = null
    if (contactName || identities.length) {
      const { first_name, last_name } = contactName
        ? splitName(contactName)
        : { first_name: companyName || 'Без имени', last_name: '' }
      contact = { first_name, last_name: last_name || null, position: cell(row, map.position) || null, identities }
    }
    if (!company && !contact) errors.push('нет ни названия клиента, ни контакта')
    out.push({ line: i + 2, company, contact, errors })
  })
  return out
}

/**
 * План импорта: для каждой записи — создать клиента или прикрепить к найденному.
 * existing: [{ id, name, inn }] — текущие клиенты (без поглощённых).
 * Совпадение: по ИНН, иначе по точному названию (без регистра).
 * Повторы внутри файла сводятся к одному клиенту.
 */
export function planImport(records, existing) {
  const byInn = new Map()
  const byName = new Map()
  for (const c of existing || []) {
    if (c.inn) byInn.set(c.inn, c)
    byName.set(normalizeClientName(c.name).toLowerCase(), c)
  }
  const seenInFile = new Set()
  let newClients = 0
  let matched = 0
  const items = (records || []).map((r) => {
    if (!r.company && !r.contact) return { ...r, action: 'skip' }
    if (!r.company) return { ...r, action: 'contact_only' }
    const nameKey = r.company.name.toLowerCase()
    const hit = (r.company.inn && byInn.get(r.company.inn)) || byName.get(nameKey)
    if (hit) {
      matched += 1
      return { ...r, action: 'attach', existingId: hit.id, existingName: hit.name }
    }
    const fileKey = r.company.inn || nameKey
    if (seenInFile.has(fileKey)) return { ...r, action: 'attach_new', fileKey }
    seenInFile.add(fileKey)
    newClients += 1
    return { ...r, action: 'create', fileKey }
  })
  return {
    items,
    summary: {
      total: items.length,
      newClients,
      matched,
      contacts: items.filter((i) => i.contact && i.action !== 'skip').length,
      withErrors: items.filter((i) => i.errors.length).length,
      skipped: items.filter((i) => i.action === 'skip').length,
    },
  }
}

/** Выгрузка: клиенты + контакты → строки листа Excel. */
export function buildExportAoa(clients, contactsByClient) {
  const head = ['Клиент', 'Тип', 'ИНН', 'Телефон компании', 'Email компании', 'Сайт', 'Источник', 'Комментарий',
    'Контакт', 'Должность', 'Телефон', 'Email', 'Telegram', 'Создан']
  const rows = [head]
  const sourceLabel = Object.fromEntries(Object.entries(SOURCE_BY_LABEL).map(([l, k]) => [k, l]))
  for (const c of clients || []) {
    const base = [c.name, c.kind === 'person' ? 'Физлицо' : 'Компания', c.inn || '', c.phone || '', c.email || '',
      c.website || '', sourceLabel[c.source] || '', c.comment || '']
    const contacts = contactsByClient[c.id] || []
    const created = c.created_at ? new Date(c.created_at) : ''
    if (!contacts.length) {
      rows.push([...base, '', '', '', '', '', created])
      continue
    }
    for (const p of contacts) {
      const pick = (kind) => (p.identities || []).filter((i) => i.kind === kind).map((i) => i.value).join(', ')
      rows.push([...base, [p.last_name, p.first_name].filter(Boolean).join(' '), p.position || '',
        pick('phone'), pick('email'), pick('telegram'), created])
    }
  }
  return rows
}
