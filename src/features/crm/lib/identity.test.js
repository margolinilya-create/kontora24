import { describe, it, expect } from 'vitest'
import {
  normalizePhone, formatPhone, normalizeEmail, normalizeTelegram,
  normalizeIdentity, identityError, prepareIdentities, identityHref, identityDisplay,
} from './identity'

describe('normalizePhone', () => {
  it.each([
    ['8 (999) 123-45-67', '+79991234567'],
    ['+7 999 123 45 67', '+79991234567'],
    ['79991234567', '+79991234567'],
    ['9991234567', '+79991234567'],
    ['+8 999 123-45-67', '+79991234567'],
    ['+375 29 123-45-67', '+375291234567'],
  ])('%s → %s', (raw, norm) => {
    expect(normalizePhone(raw)).toBe(norm)
  })

  it('отбрасывает короткие, пустые и слишком длинные', () => {
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone('1234567890123456')).toBeNull()
  })
})

describe('formatPhone', () => {
  it('форматирует российский, иностранный — как есть', () => {
    expect(formatPhone('+79991234567')).toBe('+7 999 123-45-67')
    expect(formatPhone('+375291234567')).toBe('+375291234567')
    expect(formatPhone(null)).toBe('')
  })
})

describe('normalizeEmail', () => {
  it('нижний регистр и trim', () => {
    expect(normalizeEmail('  Info@Kontora.SU ')).toBe('info@kontora.su')
  })
  it('невалидный → null', () => {
    expect(normalizeEmail('info@kontora')).toBeNull()
    expect(normalizeEmail('нет')).toBeNull()
  })
})

describe('normalizeTelegram', () => {
  it.each([
    ['@Kontora3D', 'kontora3d'],
    ['https://t.me/kontora3d', 'kontora3d'],
    ['t.me/kontora3d?start=1', 'kontora3d'],
    ['123456789', '123456789'],
  ])('%s → %s', (raw, norm) => {
    expect(normalizeTelegram(raw)).toBe(norm)
  })
  it('невалидный → null', () => {
    expect(normalizeTelegram('@ab')).toBeNull()
    expect(normalizeTelegram('имя')).toBeNull()
  })
})

describe('normalizeIdentity / identityError', () => {
  it('диспатчит по виду', () => {
    expect(normalizeIdentity('phone', '89991234567')).toBe('+79991234567')
    expect(normalizeIdentity('max', '  Some  ID ')).toBe('some id')
    expect(normalizeIdentity('unknown', 'x')).toBeNull()
  })
  it('ошибки только для заполненных невалидных', () => {
    expect(identityError('phone', '')).toBeNull()
    expect(identityError('phone', '123')).toMatch(/10 цифр/)
    expect(identityError('email', 'a@b')).toMatch(/email/)
    expect(identityError('email', 'a@b.ru')).toBeNull()
  })
})

describe('prepareIdentities', () => {
  it('отбрасывает пустые/невалидные, схлопывает дубли, одна основная на вид', () => {
    const out = prepareIdentities([
      { kind: 'phone', value: '8 999 123-45-67' },
      { kind: 'phone', value: '+7 (999) 1234567' },
      { kind: 'phone', value: '' },
      { kind: 'email', value: 'bad' },
      { kind: 'email', value: 'A@B.RU' },
      { kind: 'phone', value: '+7 912 000-00-00', is_primary: true },
    ])
    expect(out).toHaveLength(3)
    const phones = out.filter((r) => r.kind === 'phone')
    expect(phones.map((p) => p.value_norm)).toEqual(['+79991234567', '+79120000000'])
    expect(phones.map((p) => p.is_primary)).toEqual([false, true])
    expect(out.find((r) => r.kind === 'email')).toMatchObject({ value_norm: 'a@b.ru', is_primary: true })
  })
  it('несколько отмеченных основными → остаётся одна', () => {
    const out = prepareIdentities([
      { kind: 'phone', value: '89991234567', is_primary: true },
      { kind: 'phone', value: '89120000000', is_primary: true },
    ])
    expect(out.filter((r) => r.is_primary)).toHaveLength(1)
  })
  it('пустой ввод', () => {
    expect(prepareIdentities(null)).toEqual([])
  })
})

describe('identityHref / identityDisplay', () => {
  it('ссылки', () => {
    expect(identityHref({ kind: 'phone', value_norm: '+79991234567' })).toBe('tel:+79991234567')
    expect(identityHref({ kind: 'email', value_norm: 'a@b.ru' })).toBe('mailto:a@b.ru')
    expect(identityHref({ kind: 'telegram', value_norm: 'kontora3d' })).toBe('https://t.me/kontora3d')
    expect(identityHref({ kind: 'telegram', value_norm: '123456' })).toBeNull()
    expect(identityHref({ kind: 'max', value_norm: 'x' })).toBeNull()
  })
  it('отображение', () => {
    expect(identityDisplay({ kind: 'phone', value: '8999', value_norm: '+79991234567' })).toBe('+7 999 123-45-67')
    expect(identityDisplay({ kind: 'telegram', value: 't.me/kontora3d', value_norm: 'kontora3d' })).toBe('@kontora3d')
    expect(identityDisplay({ kind: 'email', value: 'A@B.ru', value_norm: 'a@b.ru' })).toBe('A@B.ru')
  })
})
