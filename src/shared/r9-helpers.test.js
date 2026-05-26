import { describe, it, expect } from 'vitest'
import {
  getSubtaskRoute, getNextSubtaskStatus, canWriteLogForStage,
  SUBTASK_ROUTE_BACKGROUNDS, SUBTASK_ROUTE_STICKERS,
} from './constants'

describe('R9.5B getSubtaskRoute', () => {
  it('returns full backgrounds route when need_lam=true', () => {
    const route = getSubtaskRoute('backgrounds', { need_lam: true })
    expect(route).toEqual(SUBTASK_ROUTE_BACKGROUNDS)
    expect(route).toContain('laminating')
  })

  it('strips laminating from backgrounds route when need_lam=false', () => {
    const route = getSubtaskRoute('backgrounds', { need_lam: false })
    expect(route).not.toContain('laminating')
    expect(route).toEqual(['pending', 'printing', 'cutting', 'selecting', 'ready'])
  })

  it('treats missing order as need_lam=false (strips laminating)', () => {
    const route = getSubtaskRoute('backgrounds', null)
    expect(route).not.toContain('laminating')
  })

  it('always returns stickers route unchanged (no lamination on stickers track)', () => {
    expect(getSubtaskRoute('stickers', { need_lam: true })).toEqual(SUBTASK_ROUTE_STICKERS)
    expect(getSubtaskRoute('stickers', { need_lam: false })).toEqual(SUBTASK_ROUTE_STICKERS)
    expect(getSubtaskRoute('stickers', null)).toEqual(SUBTASK_ROUTE_STICKERS)
  })
})

describe('R9.5B getNextSubtaskStatus with order', () => {
  it('skips laminating when need_lam=false on backgrounds track', () => {
    // printing → laminating (full) или printing → cutting (skipped)
    expect(getNextSubtaskStatus('backgrounds', 'printing', { need_lam: true })).toBe('laminating')
    expect(getNextSubtaskStatus('backgrounds', 'printing', { need_lam: false })).toBe('cutting')
  })

  it('keeps default route when order param is omitted (legacy callers)', () => {
    expect(getNextSubtaskStatus('backgrounds', 'printing')).toBe('laminating')
    expect(getNextSubtaskStatus('stickers', 'pending')).toBe('printing')
  })

  it('returns null at end of route', () => {
    expect(getNextSubtaskStatus('backgrounds', 'ready', { need_lam: true })).toBe(null)
    expect(getNextSubtaskStatus('stickers', 'ready', null)).toBe(null)
  })
})

describe('R9.3C canWriteLogForStage', () => {
  it('returns true for any role (бриф 26.05: всем ролям открыт ввод лога)', () => {
    expect(canWriteLogForStage('admin')).toBe(true)
    expect(canWriteLogForStage('manager')).toBe(true)
    expect(canWriteLogForStage('designer')).toBe(true)
    expect(canWriteLogForStage('printer')).toBe(true)
    expect(canWriteLogForStage('post_printer')).toBe(true)
  })

  it('returns false for empty role', () => {
    expect(canWriteLogForStage(null)).toBe(false)
    expect(canWriteLogForStage('')).toBe(false)
    expect(canWriteLogForStage(undefined)).toBe(false)
  })
})
