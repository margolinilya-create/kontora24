import { describe, it, expect } from 'vitest'
import { diffIdentities } from './identity-diff'

const existing = [
  { id: 'a', kind: 'phone', value: '8999', value_norm: '+79991234567', is_primary: true },
  { id: 'b', kind: 'email', value: 'a@b.ru', value_norm: 'a@b.ru', is_primary: true },
]

describe('diffIdentities', () => {
  it('без изменений — пусто', () => {
    const next = existing.map(({ id: _id, ...r }) => r)
    expect(diffIdentities(existing, next)).toEqual({ toInsert: [], toUpdate: [], toDelete: [] })
  })

  it('новый, изменённый текст, удалённый', () => {
    const next = [
      { kind: 'phone', value: '+7 999 123-45-67', value_norm: '+79991234567', is_primary: true },
      { kind: 'telegram', value: '@k', value_norm: 'kontora3d', is_primary: true },
    ]
    expect(diffIdentities(existing, next)).toEqual({
      toInsert: [{ kind: 'telegram', value: '@k', value_norm: 'kontora3d', is_primary: true }],
      toUpdate: [{ id: 'a', patch: { value: '+7 999 123-45-67' } }],
      toDelete: ['b'],
    })
  })

  it('смена основного', () => {
    const next = [{ kind: 'phone', value: '8999', value_norm: '+79991234567', is_primary: false }]
    expect(diffIdentities(existing, next).toUpdate).toEqual([{ id: 'a', patch: { is_primary: false } }])
  })

  it('пустые входы', () => {
    expect(diffIdentities(null, null)).toEqual({ toInsert: [], toUpdate: [], toDelete: [] })
  })
})
