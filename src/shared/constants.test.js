import { describe, it, expect } from 'vitest'
import {
  getNextStatus, getOrderRoute, IS_3D_TYPE, IS_3D_STICKERPACK,
  isDualTrack,
  OPERATION_CHECKLISTS, PRIORITIES, ORDER_STATUSES,
  CAN_CANCEL_ROLES, ROLES, ORDER_TYPES, ORDER_ROUTES,
  NOTIFY_ROLES,
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

describe('IS_3D_STICKERPACK', () => {
  it('returns true only for stickerpack3D', () => {
    expect(IS_3D_STICKERPACK('stickerpack3D')).toBe(true)
    expect(IS_3D_STICKERPACK('sticker3D')).toBe(false)
    expect(IS_3D_STICKERPACK('stickerpack')).toBe(false)
  })
})

describe('getOrderRoute', () => {
  it('regular order includes lamination when need_lam=true', () => {
    const route = getOrderRoute({ order_type: 'sticker_cut', need_lam: true })
    expect(route).toContain('lamination')
    expect(route).toEqual(['new', 'design', 'prepress', 'print', 'lamination', 'cutting', 'packaging', 'otk', 'done'])
  })

  it('regular order skips lamination when need_lam=false', () => {
    const route = getOrderRoute({ order_type: 'sticker_cut', need_lam: false })
    expect(route).not.toContain('lamination')
  })

  it('3D sticker route has pouring, no lamination', () => {
    const route = getOrderRoute({ order_type: 'sticker3D' })
    expect(route).toContain('pouring')
    expect(route).not.toContain('lamination')
    expect(route).not.toContain('selection_pouring')
    expect(route).not.toContain('assembly_3d')
  })

  it('3D stickerpack route has selection_pouring and assembly_3d', () => {
    const route = getOrderRoute({ order_type: 'stickerpack3D', need_lam: true })
    expect(route).toContain('selection_pouring')
    expect(route).toContain('assembly_3d')
    expect(route).toContain('lamination')
    expect(route).not.toContain('pouring')
  })

  it('3D stickerpack skips lamination when need_lam=false', () => {
    const route = getOrderRoute({ order_type: 'stickerpack3D', need_lam: false })
    expect(route).not.toContain('lamination')
    expect(route).toContain('selection_pouring')
  })

  it('fallback for unknown order type', () => {
    const route = getOrderRoute({ order_type: 'unknown' })
    expect(route[0]).toBe('new')
    expect(route[route.length - 1]).toBe('done')
  })
})

describe('isDualTrack', () => {
  it('true for stickerpack3D at dual-track stages', () => {
    const order = { order_type: 'stickerpack3D' }
    expect(isDualTrack('print', order)).toBe(true)
    expect(isDualTrack('cutting', order)).toBe(true)
    expect(isDualTrack('selection_pouring', order)).toBe(true)
  })

  it('false for stickerpack3D at non-dual-track stages', () => {
    const order = { order_type: 'stickerpack3D' }
    expect(isDualTrack('design', order)).toBe(false)
    expect(isDualTrack('lamination', order)).toBe(false)
    expect(isDualTrack('packaging', order)).toBe(false)
  })

  it('false for non-stickerpack3D orders', () => {
    expect(isDualTrack('print', { order_type: 'sticker3D' })).toBe(false)
    expect(isDualTrack('print', { order_type: 'sticker_cut' })).toBe(false)
  })
})

describe('getNextStatus', () => {
  it('admin full path — regular order with lamination', () => {
    const order = { order_type: 'sticker_cut', need_lam: true }
    const path = ['new', 'design', 'prepress', 'print', 'lamination', 'cutting', 'packaging', 'otk', 'done']
    for (let i = 0; i < path.length - 1; i++) {
      expect(getNextStatus('admin', path[i], order)).toBe(path[i + 1])
    }
  })

  it('admin full path — regular order without lamination', () => {
    const order = { order_type: 'sticker_cut', need_lam: false }
    const path = ['new', 'design', 'prepress', 'print', 'cutting', 'packaging', 'otk', 'done']
    for (let i = 0; i < path.length - 1; i++) {
      expect(getNextStatus('admin', path[i], order)).toBe(path[i + 1])
    }
  })

  it('admin full path — 3D sticker', () => {
    const order = { order_type: 'sticker3D' }
    const path = ['new', 'design', 'prepress', 'print', 'cutting', 'pouring', 'packaging', 'otk', 'done']
    for (let i = 0; i < path.length - 1; i++) {
      expect(getNextStatus('admin', path[i], order)).toBe(path[i + 1])
    }
  })

  it('admin full path — 3D stickerpack with lamination', () => {
    const order = { order_type: 'stickerpack3D', need_lam: true }
    const path = ['new', 'design', 'prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'assembly_3d', 'packaging', 'otk', 'done']
    for (let i = 0; i < path.length - 1; i++) {
      expect(getNextStatus('admin', path[i], order)).toBe(path[i + 1])
    }
  })

  it('designer can advance design and prepress', () => {
    const order = { order_type: 'sticker_cut' }
    expect(getNextStatus('designer', 'design', order)).toBe('prepress')
    expect(getNextStatus('designer', 'prepress', order)).toBe('print')
  })

  it('designer cannot advance beyond prepress', () => {
    const order = { order_type: 'sticker_cut', need_lam: true }
    expect(getNextStatus('designer', 'print', order)).toBeUndefined()
    expect(getNextStatus('designer', 'cutting', order)).toBeUndefined()
  })

  it('printer can advance prepress through cutting', () => {
    const order = { order_type: 'sticker_cut', need_lam: true }
    expect(getNextStatus('printer', 'prepress', order)).toBe('print')
    expect(getNextStatus('printer', 'print', order)).toBe('lamination')
    expect(getNextStatus('printer', 'lamination', order)).toBe('cutting')
    expect(getNextStatus('printer', 'cutting', order)).toBe('packaging')
  })

  it('post_printer can advance pouring, selection_pouring, assembly_3d, packaging', () => {
    const order3d = { order_type: 'sticker3D' }
    expect(getNextStatus('post_printer', 'pouring', order3d)).toBe('packaging')

    const orderPack = { order_type: 'stickerpack3D', need_lam: true }
    expect(getNextStatus('post_printer', 'selection_pouring', orderPack)).toBe('assembly_3d')
    expect(getNextStatus('post_printer', 'assembly_3d', orderPack)).toBe('packaging')
    expect(getNextStatus('post_printer', 'packaging', orderPack)).toBe('otk')
  })

  it('returns undefined for done/cancelled (terminal)', () => {
    expect(getNextStatus('admin', 'done', { order_type: 'sticker_cut' })).toBeUndefined()
    expect(getNextStatus('admin', 'cancelled', { order_type: 'sticker_cut' })).toBeUndefined()
  })

  it('returns undefined for unauthorized role', () => {
    expect(getNextStatus('designer', 'print', { order_type: 'sticker_cut' })).toBeUndefined()
  })

  it('handles null/undefined order gracefully', () => {
    // Falls back to regular route
    expect(getNextStatus('admin', 'new', null)).toBe('design')
    expect(getNextStatus('admin', 'new', undefined)).toBe('design')
  })
})

describe('ORDER_STATUSES', () => {
  it('has 13 statuses', () => {
    expect(Object.keys(ORDER_STATUSES)).toHaveLength(13)
  })

  it('order field is sequential 0-12', () => {
    const orders = Object.values(ORDER_STATUSES).map(s => s.order).sort((a, b) => a - b)
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('each status has label and color', () => {
    for (const [key, val] of Object.entries(ORDER_STATUSES)) {
      expect(val.label, `${key} missing label`).toBeDefined()
      expect(val.color, `${key} missing color`).toBeDefined()
    }
  })

  it('includes new stages', () => {
    expect(ORDER_STATUSES.prepress).toBeDefined()
    expect(ORDER_STATUSES.lamination).toBeDefined()
    expect(ORDER_STATUSES.cutting).toBeDefined()
    expect(ORDER_STATUSES.selection_pouring).toBeDefined()
    expect(ORDER_STATUSES.pouring).toBeDefined()
    expect(ORDER_STATUSES.assembly_3d).toBeDefined()
  })

  it('does not include removed statuses', () => {
    expect(ORDER_STATUSES.design_done).toBeUndefined()
    expect(ORDER_STATUSES.print_done).toBeUndefined()
    expect(ORDER_STATUSES.post_processing).toBeUndefined()
    expect(ORDER_STATUSES.resin_pouring).toBeUndefined()
    expect(ORDER_STATUSES.assembly).toBeUndefined()
  })
})

describe('ROLES', () => {
  it('has 5 roles', () => {
    expect(Object.keys(ROLES)).toHaveLength(5)
  })

  it('includes post_printer, not assembler/resin_pourer', () => {
    expect(ROLES.post_printer).toBeDefined()
    expect(ROLES.assembler).toBeUndefined()
    expect(ROLES.resin_pourer).toBeUndefined()
  })
})

describe('CAN_CANCEL_ROLES', () => {
  it('includes only admin and manager', () => {
    expect(CAN_CANCEL_ROLES).toContain('admin')
    expect(CAN_CANCEL_ROLES).toContain('manager')
    expect(CAN_CANCEL_ROLES).toHaveLength(2)
  })
})

describe('ORDER_ROUTES', () => {
  it('has routes for all order types', () => {
    for (const type of Object.keys(ORDER_TYPES)) {
      expect(ORDER_ROUTES[type], `missing route for ${type}`).toBeDefined()
    }
  })

  it('all routes start with new and end with done', () => {
    for (const [type, route] of Object.entries(ORDER_ROUTES)) {
      expect(route[0], `${type} should start with new`).toBe('new')
      expect(route[route.length - 1], `${type} should end with done`).toBe('done')
    }
  })
})

describe('NOTIFY_ROLES', () => {
  it('notifies designer on design', () => {
    expect(NOTIFY_ROLES.design).toContain('designer')
  })

  it('notifies printer on print, lamination, cutting', () => {
    expect(NOTIFY_ROLES.print).toContain('printer')
    expect(NOTIFY_ROLES.lamination).toContain('printer')
    expect(NOTIFY_ROLES.cutting).toContain('printer')
  })

  it('notifies post_printer on pouring, selection_pouring, assembly_3d, packaging', () => {
    expect(NOTIFY_ROLES.pouring).toContain('post_printer')
    expect(NOTIFY_ROLES.selection_pouring).toContain('post_printer')
    expect(NOTIFY_ROLES.assembly_3d).toContain('post_printer')
    expect(NOTIFY_ROLES.packaging).toContain('post_printer')
  })

  it('does not notify for terminal statuses', () => {
    expect(NOTIFY_ROLES.done).toBeUndefined()
    expect(NOTIFY_ROLES.cancelled).toBeUndefined()
  })
})

describe('OPERATION_CHECKLISTS', () => {
  it('has checklists for all order types', () => {
    for (const type of Object.keys(ORDER_TYPES)) {
      expect(OPERATION_CHECKLISTS[type], `missing checklist for ${type}`).toBeDefined()
      expect(OPERATION_CHECKLISTS[type].length).toBeGreaterThan(0)
    }
  })

  it('3D stickerpack includes parallel steps', () => {
    expect(OPERATION_CHECKLISTS.stickerpack3D).toContain('Печать фонов')
    expect(OPERATION_CHECKLISTS.stickerpack3D).toContain('Заливка стикеров')
    expect(OPERATION_CHECKLISTS.stickerpack3D).toContain('Сборка 3D')
  })
})

describe('PRIORITIES', () => {
  it('has correct sort order', () => {
    expect(PRIORITIES.low.sortOrder).toBeLessThan(PRIORITIES.normal.sortOrder)
    expect(PRIORITIES.normal.sortOrder).toBeLessThan(PRIORITIES.high.sortOrder)
    expect(PRIORITIES.high.sortOrder).toBeLessThan(PRIORITIES.urgent.sortOrder)
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
