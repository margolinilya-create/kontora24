// R28.0 — нормализация каналов связи контакта (k24_contact_identities.value_norm).
// Чистые функции без React. value_norm — ключ поиска дублей и (в будущих
// сериях) склейки входящих сообщений/звонков с контактом.

export const IDENTITY_KINDS = {
  phone: { label: 'Телефон', placeholder: '+7 999 123-45-67', inputMode: 'tel' },
  email: { label: 'Email', placeholder: 'name@example.ru', inputMode: 'email' },
  telegram: { label: 'Telegram', placeholder: '@username', inputMode: 'text' },
  max: { label: 'MAX', placeholder: 'ID или ссылка', inputMode: 'text' },
  other: { label: 'Другое', placeholder: '', inputMode: 'text' },
}

/**
 * Телефон → E.164. Российские номера: 8XXXXXXXXXX / 7XXXXXXXXXX / 9XXXXXXXXX
 * (10 цифр) → +7XXXXXXXXXX. Номер с явным «+» — только цифры после плюса.
 * Невалидный (меньше 10 или больше 15 цифр) → null.
 */
export function normalizePhone(raw) {
  if (raw == null) return null
  const str = String(raw).trim()
  if (!str) return null
  const hasPlus = str.startsWith('+')
  const digits = str.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null
  if (hasPlus) {
    // +8… — частая ошибка ввода российского номера
    if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`
    return `+${digits}`
  }
  if (digits.length === 10) return `+7${digits}`
  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    return `+7${digits.slice(1)}`
  }
  return `+${digits}`
}

/** +79991234567 → +7 999 123-45-67; иные — как есть. */
export function formatPhone(norm) {
  if (!norm) return ''
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(norm)
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : norm
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  return EMAIL_RE.test(v) ? v : null
}

/** @user, t.me/user, https://t.me/user → user; числовой id — как есть. */
export function normalizeTelegram(raw) {
  let v = String(raw ?? '').trim().toLowerCase()
  if (!v) return null
  v = v.replace(/^https?:\/\//, '').replace(/^(t\.me|telegram\.me)\//, '').replace(/^@/, '')
  v = v.split(/[/?#]/)[0]
  return /^[a-z0-9_]{3,64}$/.test(v) ? v : null
}

function normalizeGeneric(raw) {
  const v = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return v || null
}

/** Единая точка: (kind, value) → value_norm или null, если значение невалидно. */
export function normalizeIdentity(kind, value) {
  switch (kind) {
    case 'phone': return normalizePhone(value)
    case 'email': return normalizeEmail(value)
    case 'telegram': return normalizeTelegram(value)
    case 'max':
    case 'other': return normalizeGeneric(value)
    default: return null
  }
}

/** Сообщение об ошибке для UI (null — ок или пусто). */
export function identityError(kind, value) {
  if (!String(value ?? '').trim()) return null
  if (normalizeIdentity(kind, value)) return null
  if (kind === 'phone') return 'Телефон: нужно минимум 10 цифр'
  if (kind === 'email') return 'Неверный email'
  if (kind === 'telegram') return 'Telegram: @username или ссылка t.me'
  return 'Неверное значение'
}

/**
 * Строки редактора → записи для вставки. Пустые/невалидные отбрасываются,
 * дубли (kind+norm) схлопываются; у каждого вида ровно одна основная запись
 * (явно отмеченная последней или первая).
 */
export function prepareIdentities(rows) {
  const seen = new Set()
  const out = []
  for (const row of rows || []) {
    const value = String(row?.value ?? '').trim()
    if (!value) continue
    const valueNorm = normalizeIdentity(row.kind, value)
    if (!valueNorm) continue
    const key = `${row.kind}:${valueNorm}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind: row.kind, value, value_norm: valueNorm, is_primary: !!row.is_primary })
  }
  for (const kind of Object.keys(IDENTITY_KINDS)) {
    const ofKind = out.filter((r) => r.kind === kind)
    if (!ofKind.length) continue
    const primaries = ofKind.filter((r) => r.is_primary)
    const keep = primaries.length ? primaries[primaries.length - 1] : ofKind[0]
    for (const r of ofKind) r.is_primary = r === keep
  }
  return out
}

/** Ссылка для клика: tel:/mailto:/t.me. null — не кликабельно. */
export function identityHref(identity) {
  if (!identity?.value_norm) return null
  switch (identity.kind) {
    case 'phone': return `tel:${identity.value_norm}`
    case 'email': return `mailto:${identity.value_norm}`
    case 'telegram': return /^\d+$/.test(identity.value_norm) ? null : `https://t.me/${identity.value_norm}`
    default: return null
  }
}

/** Отображаемое значение. */
export function identityDisplay(identity) {
  if (!identity) return ''
  if (identity.kind === 'phone') return formatPhone(identity.value_norm) || identity.value
  if (identity.kind === 'telegram' && identity.value_norm && !/^\d+$/.test(identity.value_norm)) {
    return `@${identity.value_norm}`
  }
  return identity.value
}
