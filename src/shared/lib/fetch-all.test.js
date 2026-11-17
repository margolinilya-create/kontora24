import { describe, it, expect, vi } from 'vitest'
import { fetchAllRows, fetchAllRowsByIds } from './fetch-all'

/** Фейковый query builder: .range(from, to) → { data } из массива rows. */
function fakeQuery(rows, calls, ids = null) {
  return {
    range(from, to) {
      calls.push({ from, to, ids })
      const src = ids ? rows.filter((r) => ids.includes(r.order_id)) : rows
      return Promise.resolve({ data: src.slice(from, to + 1), error: null })
    },
  }
}

describe('fetchAllRows', () => {
  it('забирает все строки порциями по 1000 (а не первую тысячу)', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }))
    const calls = []
    const out = await fetchAllRows(() => fakeQuery(rows, calls))
    expect(out).toHaveLength(2500)
    expect(calls.map((c) => c.from)).toEqual([0, 1000, 2000])
  })

  it('пробрасывает ошибку запроса', async () => {
    const err = new Error('boom')
    await expect(fetchAllRows(() => ({ range: () => Promise.resolve({ data: null, error: err }) })))
      .rejects.toBe(err)
  })

  it('превышение cap — ошибка, а не тихий срез', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: i }))
    await expect(fetchAllRows(() => fakeQuery(rows, []), { cap: 20, chunk: 10 }))
      .rejects.toMatchObject({ code: 'EXPORT_TOO_LARGE' })
  })
})

describe('fetchAllRowsByIds', () => {
  it('режет id на пачки и склеивает результат, дубли id убирает', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: i, order_id: `o${i}` }))
    const ids = [...rows.map((r) => r.order_id), 'o1', null]
    const calls = []
    const make = vi.fn((part) => fakeQuery(rows, calls, part))
    const out = await fetchAllRowsByIds(ids, make, { idChunk: 100 })
    expect(out).toHaveLength(250)
    expect(make).toHaveBeenCalledTimes(3)
    expect(make.mock.calls.map(([p]) => p.length)).toEqual([100, 100, 50])
  })

  it('пустой список id — без запросов', async () => {
    const make = vi.fn()
    expect(await fetchAllRowsByIds([], make)).toEqual([])
    expect(make).not.toHaveBeenCalled()
  })
})
