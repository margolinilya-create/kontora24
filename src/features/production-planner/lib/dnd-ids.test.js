import { describe, it, expect } from 'vitest'
import { makeDragId, parseDragId, makeDropId, parseDropId } from './dnd-ids'

describe('dnd-ids', () => {
  it('drag id roundtrip', () => {
    const id = makeDragId('ord-1', 'print')
    expect(id).toBe('chip::ord-1::print')
    expect(parseDragId(id)).toEqual({ orderId: 'ord-1', stage: 'print' })
  })

  it('drop id roundtrip', () => {
    const id = makeDropId('oprl_print', '2026-06-15')
    expect(id).toBe('cell::oprl_print::2026-06-15')
    expect(parseDropId(id)).toEqual({ bucket: 'oprl_print', date: '2026-06-15' })
  })

  it('parsers возвращают null для чужих/пустых id', () => {
    expect(parseDragId('cell::a::b')).toBeNull()
    expect(parseDragId(null)).toBeNull()
    expect(parseDragId('')).toBeNull()
    expect(parseDropId('chip::a::b')).toBeNull()
    expect(parseDropId(undefined)).toBeNull()
  })

  it('UUID в orderId не ломает парсер', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const id = makeDragId(uuid, 'cutting')
    expect(parseDragId(id)).toEqual({ orderId: uuid, stage: 'cutting' })
  })
})
