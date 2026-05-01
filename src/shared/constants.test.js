import { describe, it, expect } from 'vitest'
import { getNextStatus, IS_3D_TYPE, OPERATION_CHECKLISTS, PRIORITIES } from './constants'

describe('IS_3D_TYPE', () => {
  it('returns true for 3D types', () => {
    expect(IS_3D_TYPE('sticker3D')).toBe(true)
    expect(IS_3D_TYPE('stickerpack3D')).toBe(true)
  })

  it('returns false for non-3D types', () => {
    expect(IS_3D_TYPE('sticker_cut')).toBe(false)
    expect(IS_3D_TYPE('stickerpack')).toBe(false)
    expect(IS_3D_TYPE('rect')).toBe(false)
    expect(IS_3D_TYPE(undefined)).toBe(false)
  })
})

describe('getNextStatus', () => {
  it('returns next status for admin', () => {
    expect(getNextStatus('admin', 'new', { order_type: 'sticker_cut' })).toBe('design')
    expect(getNextStatus('admin', 'design', { order_type: 'sticker_cut' })).toBe('design_done')
    expect(getNextStatus('admin', 'print_done', { order_type: 'sticker_cut' })).toBe('post_processing')
    expect(getNextStatus('admin', 'assembly', { order_type: 'sticker_cut' })).toBe('packaging')
    expect(getNextStatus('admin', 'packaging', { order_type: 'sticker_cut' })).toBe('done')
  })

  it('routes 3D orders through resin_pouring after post_processing', () => {
    expect(getNextStatus('admin', 'post_processing', { order_type: 'sticker3D' })).toBe('resin_pouring')
    expect(getNextStatus('manager', 'post_processing', { order_type: 'stickerpack3D' })).toBe('resin_pouring')
  })

  it('skips resin for non-3D orders (post_processing -> assembly)', () => {
    expect(getNextStatus('admin', 'post_processing', { order_type: 'sticker_cut' })).toBe('assembly')
    expect(getNextStatus('admin', 'post_processing', { order_type: 'stickerpack' })).toBe('assembly')
  })

  it('handles resin_pourer role', () => {
    expect(getNextStatus('resin_pourer', 'resin_pouring', { order_type: 'sticker3D' })).toBe('assembly')
  })

  it('returns undefined for invalid transitions', () => {
    expect(getNextStatus('designer', 'print', { order_type: 'sticker_cut' })).toBeUndefined()
    expect(getNextStatus('printer', 'design', { order_type: 'sticker_cut' })).toBeUndefined()
  })
})

describe('OPERATION_CHECKLISTS', () => {
  it('has checklists for all order types', () => {
    const types = ['sticker_cut', 'sticker_kiss', 'stickerpack', 'sticker3D', 'stickerpack3D', 'rect', 'big']
    types.forEach(type => {
      expect(OPERATION_CHECKLISTS[type]).toBeDefined()
      expect(OPERATION_CHECKLISTS[type].length).toBeGreaterThan(0)
    })
  })

  it('3D types include resin steps', () => {
    expect(OPERATION_CHECKLISTS['sticker3D']).toContain('Заливка смолой')
    expect(OPERATION_CHECKLISTS['stickerpack3D']).toContain('Заливка смолой')
  })

  it('non-3D types do not include resin steps', () => {
    expect(OPERATION_CHECKLISTS['sticker_cut']).not.toContain('Заливка смолой')
    expect(OPERATION_CHECKLISTS['rect']).not.toContain('Заливка смолой')
  })
})

describe('PRIORITIES', () => {
  it('has correct sort order', () => {
    expect(PRIORITIES.low.sortOrder).toBeLessThan(PRIORITIES.normal.sortOrder)
    expect(PRIORITIES.normal.sortOrder).toBeLessThan(PRIORITIES.high.sortOrder)
    expect(PRIORITIES.high.sortOrder).toBeLessThan(PRIORITIES.urgent.sortOrder)
  })
})
