import { describe, it, expect } from 'vitest'
import { computeStageProgress, computeDualTrackProgress, validateLogEntry, STAGE_FIELDS } from './production-logs'

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
