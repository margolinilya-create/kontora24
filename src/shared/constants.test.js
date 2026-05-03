import { describe, it, expect } from 'vitest'
import {
  getNextStatus, IS_3D_TYPE, OPERATION_CHECKLISTS, PRIORITIES,
  ORDER_STATUSES, STATUS_TRANSITIONS, CAN_CANCEL_ROLES,
  ROLES, ORDER_TYPES, VOLUME_DISCOUNTS, NOTIFY_ROLES, NAV_ITEMS,
} from './constants'

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
    expect(getNextStatus('admin', 'packaging', { order_type: 'sticker_cut' })).toBe('otk')
    expect(getNextStatus('admin', 'otk', { order_type: 'sticker_cut' })).toBe('done')
  })

  it('routes post_processing to assembly for flat orders', () => {
    expect(getNextStatus('admin', 'post_processing', { order_type: 'sticker_cut' })).toBe('assembly')
    expect(getNextStatus('admin', 'post_processing', { order_type: 'stickerpack' })).toBe('assembly')
  })

  it('routes 3D orders through resin_pouring after post_processing', () => {
    expect(getNextStatus('admin', 'post_processing', { order_type: 'sticker3D' })).toBe('resin_pouring')
    expect(getNextStatus('manager', 'post_processing', { order_type: 'stickerpack3D' })).toBe('resin_pouring')
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

describe('getNextStatus — exhaustive matrix', () => {
  it('admin has full path from new to done (non-3D)', () => {
    const order = { order_type: 'sticker_cut' }
    const path = ['new', 'design', 'design_done', 'print', 'print_done', 'post_processing', 'assembly', 'packaging', 'otk', 'done']
    for (let i = 0; i < path.length - 1; i++) {
      expect(getNextStatus('admin', path[i], order)).toBe(path[i + 1])
    }
  })

  it('admin 3D path includes resin_pouring', () => {
    const order = { order_type: 'sticker3D' }
    expect(getNextStatus('admin', 'post_processing', order)).toBe('resin_pouring')
    expect(getNextStatus('admin', 'resin_pouring', order)).toBe('assembly')
  })

  it('printer can advance post_processing to assembly', () => {
    expect(getNextStatus('printer', 'post_processing', { order_type: 'sticker_cut' })).toBe('assembly')
  })

  it('printer routes 3D post_processing to resin_pouring', () => {
    expect(getNextStatus('printer', 'post_processing', { order_type: 'sticker3D' })).toBe('resin_pouring')
  })

  it('assembler can advance post_processing, assembly, packaging', () => {
    const order = { order_type: 'sticker_cut' }
    expect(getNextStatus('assembler', 'post_processing', order)).toBe('assembly')
    expect(getNextStatus('assembler', 'assembly', order)).toBe('packaging')
    expect(getNextStatus('assembler', 'packaging', order)).toBe('otk')
  })

  it('assembler routes 3D post_processing to resin_pouring', () => {
    expect(getNextStatus('assembler', 'post_processing', { order_type: 'stickerpack3D' })).toBe('resin_pouring')
  })

  it('assembler can advance resin_pouring to assembly', () => {
    expect(getNextStatus('assembler', 'resin_pouring', { order_type: 'sticker3D' })).toBe('assembly')
  })

  it('returns undefined for done status (terminal)', () => {
    expect(getNextStatus('admin', 'done', { order_type: 'sticker_cut' })).toBeUndefined()
  })

  it('returns undefined for cancelled status (terminal)', () => {
    expect(getNextStatus('admin', 'cancelled', { order_type: 'sticker_cut' })).toBeUndefined()
  })

  it('designer cannot advance beyond design_done', () => {
    expect(getNextStatus('designer', 'design_done', { order_type: 'sticker_cut' })).toBeUndefined()
    expect(getNextStatus('designer', 'print', { order_type: 'sticker_cut' })).toBeUndefined()
  })

  it('handles null/undefined order gracefully', () => {
    // Without order, IS_3D_TYPE(undefined) returns false, so regular path
    expect(getNextStatus('admin', 'post_processing', null)).toBe('assembly')
    expect(getNextStatus('admin', 'post_processing', undefined)).toBe('assembly')
  })
})

describe('CAN_CANCEL_ROLES', () => {
  it('includes only admin and manager', () => {
    expect(CAN_CANCEL_ROLES).toContain('admin')
    expect(CAN_CANCEL_ROLES).toContain('manager')
    expect(CAN_CANCEL_ROLES).toHaveLength(2)
  })

  it('does not include worker roles', () => {
    expect(CAN_CANCEL_ROLES).not.toContain('designer')
    expect(CAN_CANCEL_ROLES).not.toContain('printer')
    expect(CAN_CANCEL_ROLES).not.toContain('assembler')
    expect(CAN_CANCEL_ROLES).not.toContain('resin_pourer')
  })
})

describe('ORDER_STATUSES', () => {
  it('has 12 statuses', () => {
    expect(Object.keys(ORDER_STATUSES)).toHaveLength(12)
  })

  it('order field is sequential 0-11', () => {
    const orders = Object.values(ORDER_STATUSES).map(s => s.order).sort((a, b) => a - b)
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('each status has label and color', () => {
    for (const [key, val] of Object.entries(ORDER_STATUSES)) {
      expect(val.label, `${key} missing label`).toBeDefined()
      expect(val.color, `${key} missing color`).toBeDefined()
    }
  })
})

describe('IS_3D_TYPE — all ORDER_TYPES', () => {
  it('only sticker3D and stickerpack3D are 3D', () => {
    for (const key of Object.keys(ORDER_TYPES)) {
      if (key === 'sticker3D' || key === 'stickerpack3D') {
        expect(IS_3D_TYPE(key)).toBe(true)
      } else {
        expect(IS_3D_TYPE(key)).toBe(false)
      }
    }
  })
})

describe('VOLUME_DISCOUNTS', () => {
  it('ranges are contiguous (no gaps)', () => {
    for (let i = 1; i < VOLUME_DISCOUNTS.length; i++) {
      expect(VOLUME_DISCOUNTS[i].min).toBe(VOLUME_DISCOUNTS[i - 1].max + 1)
    }
  })

  it('starts at 1 and ends at Infinity', () => {
    expect(VOLUME_DISCOUNTS[0].min).toBe(1)
    expect(VOLUME_DISCOUNTS[VOLUME_DISCOUNTS.length - 1].max).toBe(Infinity)
  })

  it('discounts increase monotonically', () => {
    for (let i = 1; i < VOLUME_DISCOUNTS.length; i++) {
      expect(VOLUME_DISCOUNTS[i].discount).toBeGreaterThanOrEqual(VOLUME_DISCOUNTS[i - 1].discount)
    }
  })
})

describe('NOTIFY_ROLES', () => {
  it('notifies designer on design status', () => {
    expect(NOTIFY_ROLES.design).toContain('designer')
  })

  it('notifies printer on print status', () => {
    expect(NOTIFY_ROLES.print).toContain('printer')
  })

  it('notifies resin_pourer on resin_pouring status', () => {
    expect(NOTIFY_ROLES.resin_pouring).toContain('resin_pourer')
  })

  it('notifies assembler on assembly and packaging', () => {
    expect(NOTIFY_ROLES.assembly).toContain('assembler')
    expect(NOTIFY_ROLES.packaging).toContain('assembler')
  })

  it('does not notify for terminal statuses (done, cancelled)', () => {
    expect(NOTIFY_ROLES.done).toBeUndefined()
    expect(NOTIFY_ROLES.cancelled).toBeUndefined()
  })
})
