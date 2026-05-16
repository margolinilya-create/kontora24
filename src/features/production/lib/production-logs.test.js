import { describe, it, expect } from 'vitest'
import { computeStageProgress, computeDualTrackProgress, computeIncoming, validateLogEntry, STAGE_FIELDS } from './production-logs'

const ROUTE = ['new', 'design', 'prepress', 'print', 'lamination', 'cutting', 'packaging', 'otk', 'done']

describe('computeStageProgress', () => {
  it('returns zero progress when no logs', () => {
    const result = computeStageProgress([], 'print', 100)
    expect(result).toEqual({ total: 0, target: 100, percentage: 0, isComplete: false })
  })

  it('sums quantity field for matching stage', () => {
    const logs = [
      { stage: 'print', stickers_printed: 30 },
      { stage: 'print', stickers_printed: 50 },
      { stage: 'cutting', qty_cut: 20 },
    ]
    const result = computeStageProgress(logs, 'print', 100)
    expect(result.total).toBe(80)
    expect(result.percentage).toBe(80)
    expect(result.isComplete).toBe(false)
  })

  it('marks complete when total >= target', () => {
    const logs = [
      { stage: 'cutting', qty_cut: 60 },
      { stage: 'cutting', qty_cut: 50 },
    ]
    const result = computeStageProgress(logs, 'cutting', 100)
    expect(result.total).toBe(110)
    expect(result.percentage).toBe(100) // capped at 100
    expect(result.isComplete).toBe(true)
  })

  it('marks complete when total equals target exactly', () => {
    const logs = [{ stage: 'pouring', stickers_good: 50 }]
    const result = computeStageProgress(logs, 'pouring', 50)
    expect(result.isComplete).toBe(true)
    expect(result.percentage).toBe(100)
  })

  it('filters by track when provided', () => {
    const logs = [
      { stage: 'print', track: 'backgrounds', stickers_printed: 40 },
      { stage: 'print', track: 'stickers', stickers_printed: 30 },
      { stage: 'print', track: 'backgrounds', stickers_printed: 20 },
    ]
    const result = computeStageProgress(logs, 'print', 100, 'backgrounds')
    expect(result.total).toBe(60)
  })

  it('returns zero progress for unknown stage', () => {
    const logs = [{ stage: 'unknown', qty: 50 }]
    const result = computeStageProgress(logs, 'unknown', 100)
    expect(result).toEqual({ total: 0, target: 100, percentage: 0, isComplete: false })
  })

  it('handles zero targetQty without division by zero', () => {
    const logs = [{ stage: 'print', stickers_printed: 10 }]
    const result = computeStageProgress(logs, 'print', 0)
    expect(result.percentage).toBe(0)
    expect(result.isComplete).toBe(true) // 10 >= 0
  })

  it('handles null/undefined values in quantity fields', () => {
    const logs = [
      { stage: 'print', stickers_printed: null },
      { stage: 'print', stickers_printed: undefined },
      { stage: 'print', stickers_printed: 30 },
    ]
    const result = computeStageProgress(logs, 'print', 100)
    expect(result.total).toBe(30)
  })

  it('handles string numbers in quantity fields', () => {
    const logs = [{ stage: 'print', stickers_printed: '25' }]
    const result = computeStageProgress(logs, 'print', 100)
    expect(result.total).toBe(25)
  })

  it('subtracts defects from total on whitelist stages (фидбэк 17.05)', () => {
    // print/cutting/lamination/packaging — брак НЕ годное изделие, в шкале не учитывается
    const logs = [{ stage: 'print', stickers_printed: 100, defects: 20 }]
    expect(computeStageProgress(logs, 'print', 100).total).toBe(80)
    expect(computeStageProgress([{ stage: 'cutting', qty_cut: 100, defects: 5 }], 'cutting', 100).total).toBe(95)
    expect(computeStageProgress([{ stage: 'lamination', lamination_qty: 50, defects: 10 }], 'lamination', 100).total).toBe(40)
    expect(computeStageProgress([{ stage: 'packaging', packs_packaged: 30, defects: 3 }], 'packaging', 100).total).toBe(27)
  })

  it('does NOT subtract defects on pouring/selection_pouring (stickers_good уже годные)', () => {
    expect(computeStageProgress([{ stage: 'pouring', stickers_good: 50, defects: 10 }], 'pouring', 100).total).toBe(50)
    expect(computeStageProgress(
      [{ stage: 'selection_pouring', track: 'backgrounds', qty_selected: 40, defects: 5 }],
      'selection_pouring', 100, 'backgrounds',
    ).total).toBe(40)
  })

  it('clamps to zero when defects exceed produced', () => {
    const logs = [{ stage: 'print', stickers_printed: 10, defects: 30 }]
    expect(computeStageProgress(logs, 'print', 100).total).toBe(0)
  })
})

describe('computeDualTrackProgress', () => {
  it('computes both tracks independently', () => {
    const logs = [
      { stage: 'print', track: 'backgrounds', backgrounds_printed: 50 },
      { stage: 'print', track: 'stickers', stickers_printed: 30 },
    ]
    const result = computeDualTrackProgress(logs, 'print', 100)
    expect(result.backgrounds.total).toBe(50)
    expect(result.backgrounds.percentage).toBe(50)
    expect(result.stickers.total).toBe(30)
    expect(result.stickers.percentage).toBe(30)
    expect(result.bothComplete).toBe(false)
  })

  it('bothComplete only when both tracks reach target', () => {
    const logs = [
      { stage: 'print', track: 'backgrounds', backgrounds_printed: 100 },
      { stage: 'print', track: 'stickers', stickers_printed: 100 },
    ]
    const result = computeDualTrackProgress(logs, 'print', 100)
    expect(result.bothComplete).toBe(true)
    expect(result.backgrounds.isComplete).toBe(true)
    expect(result.stickers.isComplete).toBe(true)
  })

  it('not complete when only one track is done', () => {
    const logs = [
      { stage: 'print', track: 'backgrounds', backgrounds_printed: 100 },
      { stage: 'print', track: 'stickers', stickers_printed: 50 },
    ]
    const result = computeDualTrackProgress(logs, 'print', 100)
    expect(result.bothComplete).toBe(false)
    expect(result.backgrounds.isComplete).toBe(true)
    expect(result.stickers.isComplete).toBe(false)
  })

  it('returns empty progress for unknown stage', () => {
    const logs = [{ stage: 'unknown', track: 'backgrounds', qty: 50 }]
    const result = computeDualTrackProgress(logs, 'unknown', 100)
    expect(result.backgrounds.total).toBe(0)
    expect(result.stickers.total).toBe(0)
    expect(result.bothComplete).toBe(false)
  })

  it('handles cutting stage with same field for both tracks', () => {
    const logs = [
      { stage: 'cutting', track: 'backgrounds', qty_cut: 40 },
      { stage: 'cutting', track: 'stickers', qty_cut: 60 },
    ]
    const result = computeDualTrackProgress(logs, 'cutting', 50)
    expect(result.backgrounds.total).toBe(40)
    expect(result.backgrounds.isComplete).toBe(false)
    expect(result.stickers.total).toBe(60)
    expect(result.stickers.isComplete).toBe(true)
    expect(result.bothComplete).toBe(false)
  })

  it('handles selection_pouring with different fields per track', () => {
    const logs = [
      { stage: 'selection_pouring', track: 'backgrounds', qty_selected: 100 },
      { stage: 'selection_pouring', track: 'stickers', stickers_good: 80 },
    ]
    const result = computeDualTrackProgress(logs, 'selection_pouring', 100)
    expect(result.backgrounds.total).toBe(100)
    expect(result.backgrounds.isComplete).toBe(true)
    expect(result.stickers.total).toBe(80)
    expect(result.stickers.isComplete).toBe(false)
  })

  it('handles zero targetQty', () => {
    const logs = [
      { stage: 'print', track: 'backgrounds', backgrounds_printed: 5 },
      { stage: 'print', track: 'stickers', stickers_printed: 3 },
    ]
    const result = computeDualTrackProgress(logs, 'print', 0)
    expect(result.backgrounds.percentage).toBe(0)
    expect(result.backgrounds.isComplete).toBe(true)
    expect(result.bothComplete).toBe(true)
  })

  it('accumulates multiple log entries per track', () => {
    const logs = [
      { stage: 'print', track: 'backgrounds', backgrounds_printed: 20 },
      { stage: 'print', track: 'backgrounds', backgrounds_printed: 30 },
      { stage: 'print', track: 'stickers', stickers_printed: 10 },
      { stage: 'print', track: 'stickers', stickers_printed: 15 },
    ]
    const result = computeDualTrackProgress(logs, 'print', 50)
    expect(result.backgrounds.total).toBe(50)
    expect(result.stickers.total).toBe(25)
  })
})

describe('validateLogEntry', () => {
  it('returns error for unknown stage', () => {
    expect(validateLogEntry('nonexistent', {})).toBe('Неизвестный этап')
  })

  it('returns null for valid print data', () => {
    expect(validateLogEntry('print', { stickers_printed: 10, film_meters: 1.5 })).toBeNull()
  })

  it('returns null for valid cutting data', () => {
    expect(validateLogEntry('cutting', { qty_cut: 50 })).toBeNull()
  })

  it('returns null for valid pouring data', () => {
    expect(validateLogEntry('pouring', { stickers_poured: 50, stickers_good: 45, resin_grams: 120 })).toBeNull()
  })

  it('returns null for empty data (no required fields in config)', () => {
    // Current STAGE_FIELDS has no required:true fields
    expect(validateLogEntry('packaging', {})).toBeNull()
  })

  it('returns null for valid assembly data', () => {
    expect(validateLogEntry('assembly_3d', { packs_assembled: 20 })).toBeNull()
  })

  it('does not error on negative numbers for non-number fields', () => {
    // film_type is type: 'text', not number
    expect(validateLogEntry('print', { film_type: 'G' })).toBeNull()
  })

  it('no longer caps by order qty — print accepts more than target', () => {
    // Печать — стартовый этап, вводится без ограничений (фидбэк 14.05).
    expect(validateLogEntry('print', { stickers_printed: 5000 }, {
      progress: { total: 0, target: 100 },
      incoming: { isStart: true, total: null },
    })).toBeNull()
  })

  it('no qty cap on later stages — only incoming caps', () => {
    // lamination больше не ограничен тиражом, только фактическим приходом
    expect(validateLogEntry('lamination', { lamination_qty: 300 }, {
      progress: { total: 0, target: 100 },
      incoming: { total: 500 },
    })).toBeNull()
  })

  it('caps by incoming quantity on non-start stages', () => {
    const err = validateLogEntry('lamination', { lamination_qty: 120 }, {
      progress: { total: 0 },
      incoming: { total: 100 },
    })
    expect(err).toMatch(/поступило 100/i)
  })

  it('ignores incoming cap when stage is start (isStart)', () => {
    expect(validateLogEntry('print', { stickers_printed: 999 }, {
      incoming: { isStart: true, total: null },
    })).toBeNull()
  })
})

describe('computeIncoming', () => {
  it('returns isStart for the first quantity-producing stage (print)', () => {
    const result = computeIncoming([], ROUTE, 'print', 100, null)
    expect(result.isStart).toBe(true)
    expect(result.total).toBeNull()
  })

  it('computes incoming from the previous quantity stage', () => {
    const logs = [
      { stage: 'print', stickers_printed: 80 },
      { stage: 'print', stickers_printed: 10 },
    ]
    const result = computeIncoming(logs, ROUTE, 'lamination', 100, null)
    expect(result.total).toBe(90)
    expect(result.source).toBe('print')
  })

  it('subtracts previous-stage defects from incoming', () => {
    const logs = [{ stage: 'print', stickers_printed: 100, defects: 15 }]
    const result = computeIncoming(logs, ROUTE, 'lamination', 100, null)
    expect(result.total).toBe(85)
  })

  it('returns isStart when stage is not in route', () => {
    const result = computeIncoming([], ROUTE, 'pouring', 100, null)
    expect(result.isStart).toBe(true)
  })

  it('strict track filter — track="backgrounds" игнорирует логи без track и с track="stickers" (фидбэк 17.05)', () => {
    // Раньше фильтр был `!l.track || l.track === track`. Теперь strict — только match.
    const ROUTE_PACK3D = ['new', 'design', 'prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'assembly_3d', 'packaging', 'otk', 'done']
    const logs = [
      { stage: 'print', track: 'backgrounds', backgrounds_printed: 50 },
      { stage: 'print', track: 'stickers', stickers_printed: 30 },
      { stage: 'print', stickers_printed: 5 }, // ошибочный лог без track — должен игнорироваться
    ]
    // backgrounds_printed суммируется только по track=backgrounds
    const result = computeIncoming(logs, ROUTE_PACK3D, 'lamination', 100, 'backgrounds')
    expect(result.total).toBe(50)
  })
})

describe('STAGE_FIELDS config', () => {
  it('has all production stages defined', () => {
    const expectedStages = ['print', 'lamination', 'cutting', 'pouring', 'selection_pouring', 'assembly_3d', 'packaging']
    for (const stage of expectedStages) {
      expect(STAGE_FIELDS[stage]).toBeDefined()
      expect(STAGE_FIELDS[stage].quantityField).toBeDefined()
      expect(STAGE_FIELDS[stage].fields.length).toBeGreaterThan(0)
    }
  })

  it('each stage has a valid quantityField pointing to a defined field', () => {
    for (const [, config] of Object.entries(STAGE_FIELDS)) {
      const fieldKeys = config.fields.map(f => f.key)
      expect(fieldKeys).toContain(config.quantityField)
    }
  })
})
