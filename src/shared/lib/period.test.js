import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { periodRange } from './period'

describe('periodRange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'))
  })
  afterEach(() => { vi.useRealTimers() })

  it('all → no bounds', () => {
    expect(periodRange('all')).toEqual({ from: null, to: null })
  })

  it('numeric days → from = now - days, to = null', () => {
    const r = periodRange('7')
    expect(r.from).toBe(new Date('2026-05-01T12:00:00Z').toISOString())
    expect(r.to).toBeNull()
  })

  it('custom with both dates → ISO range, exclusive end +1 day', () => {
    const r = periodRange('custom', '2026-05-01', '2026-05-07')
    expect(r.from).toBe(new Date('2026-05-01').toISOString())
    expect(r.to).toBe(new Date('2026-05-08').toISOString())
  })

  it('custom with from > to → swaps bounds', () => {
    const r = periodRange('custom', '2026-05-07', '2026-05-01')
    expect(r.from).toBe(new Date('2026-05-01').toISOString())
    expect(r.to).toBe(new Date('2026-05-08').toISOString())
  })

  it('custom with only from → to is null', () => {
    const r = periodRange('custom', '2026-05-01', '')
    expect(r.from).toBe(new Date('2026-05-01').toISOString())
    expect(r.to).toBeNull()
  })

  it('custom with only to → from is null', () => {
    const r = periodRange('custom', '', '2026-05-07')
    expect(r.from).toBeNull()
    expect(r.to).toBe(new Date('2026-05-08').toISOString())
  })

  it('custom with empty dates → both null', () => {
    expect(periodRange('custom', '', '')).toEqual({ from: null, to: null })
  })
})
