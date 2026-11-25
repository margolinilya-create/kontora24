import { describe, it, expect } from 'vitest'
import { mapHeaders, parseRows, planImport, buildExportAoa } from './import-clients'

describe('mapHeaders', () => {
  it('распознаёт русские заголовки без регистра/пробелов', () => {
    expect(mapHeaders(['Компания', 'ИНН', 'Контактное лицо', 'Телефон', 'E-mail', 'Почта', 'Неизвестно', 'Telegram']))
      .toEqual({ company: 0, inn: 1, contact: 2, phone: 3, email: 4, telegram: 7 })
  })
})

describe('parseRows', () => {
  const map = { company: 0, inn: 1, contact: 2, phone: 3, email: 4, kind: 5, source: 6 }
  it('собирает компанию, контакт и каналы связи; пустые строки пропускает', () => {
    const recs = parseRows([
      ['ООО Ромашка', '77-01 234567', 'Иванов Иван', '8 999 123-45-67', 'IVAN@R.RU', '', 'Авито'],
      ['', '', '', '', '', '', ''],
      ['Пётр', '', '', '+7 912 000 00 00', '', 'физлицо', ''],
    ], map)
    expect(recs).toHaveLength(2)
    expect(recs[0]).toMatchObject({
      line: 2,
      company: { name: 'ООО Ромашка', kind: 'company', inn: '7701234567', source: 'avito' },
      contact: { last_name: 'Иванов', first_name: 'Иван' },
      errors: [],
    })
    expect(recs[0].contact.identities.map((i) => i.kind)).toEqual(['phone', 'email'])
    expect(recs[1]).toMatchObject({ line: 4, company: { name: 'Пётр', kind: 'person' }, contact: { first_name: 'Пётр' } })
  })
  it('нераспознанный телефон — ошибка в строке, без канала связи', () => {
    const [r] = parseRows([['Альфа', '', 'Анна', '123', '', '', '']], map)
    expect(r.errors[0]).toMatch(/телефон/)
    expect(r.contact.identities).toEqual([])
  })
})

describe('planImport', () => {
  const existing = [{ id: 'c1', name: 'ООО Ромашка', inn: '7701234567' }, { id: 'c2', name: 'Бета', inn: null }]
  const rec = (company) => ({ line: 2, company, contact: null, errors: [] })
  it('совпадение по ИНН и по названию, повтор внутри файла, только контакт', () => {
    const { items, summary } = planImport([
      rec({ name: 'Ромашка ООО', inn: '7701234567' }),
      rec({ name: 'бета', inn: null }),
      rec({ name: 'Гамма', inn: null }),
      rec({ name: 'гамма', inn: null }),
      { line: 9, company: null, contact: { first_name: 'X', identities: [] }, errors: [] },
    ], existing)
    expect(items.map((i) => i.action)).toEqual(['attach', 'attach', 'create', 'attach_new', 'contact_only'])
    expect(items[0].existingId).toBe('c1')
    expect(summary).toMatchObject({ total: 5, newClients: 1, matched: 2 })
  })
})

describe('buildExportAoa', () => {
  it('строка на контакт; клиент без контактов — одна строка', () => {
    const aoa = buildExportAoa(
      [{ id: 'a', name: 'А', kind: 'company', source: 'avito' }, { id: 'b', name: 'Б', kind: 'person' }],
      { a: [{ first_name: 'Иван', last_name: 'Иванов', identities: [{ kind: 'phone', value: '8999' }, { kind: 'phone', value: '8912' }] }] },
    )
    expect(aoa).toHaveLength(3)
    expect(aoa[1].slice(0, 2)).toEqual(['А', 'Компания'])
    expect(aoa[1][6]).toBe('авито')
    expect(aoa[1][8]).toBe('Иванов Иван')
    expect(aoa[1][10]).toBe('8999, 8912')
    expect(aoa[2][1]).toBe('Физлицо')
  })
})
