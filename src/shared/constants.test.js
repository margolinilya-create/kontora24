import { describe, it, expect } from 'vitest'
import {
  getNextStatus, getOrderRoute, isStageAllowed, IS_3D_TYPE, IS_3D_STICKERPACK,
  isDualTrack,
  OPERATION_CHECKLISTS, PRIORITIES, ORDER_STATUSES,
  CAN_CANCEL_ROLES, ROLES, ORDER_TYPES, ORDER_ROUTES,
  NOTIFY_ROLES,
  getFilmCostPerMeter, calculateActualMaterialsCost, RESIN_COST_PER_GRAM,
  calculateWorkerPayout, WORKER_RATES, settingsToRates,
  getMaterialCategory, getStockStatus,
  SUBTASK_ROUTE_BACKGROUNDS, SUBTASK_ROUTE_STICKERS, SUBTASK_STATUS_LABELS,
  getSubtaskRoute, getNextSubtaskStatus,
  canAdvanceFrom, PERMISSIONS, PERMISSION_LABELS,
  reprintViewLabel,
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
  // R11.1 (бриф 31.05): добавлен sample-workflow префикс перед основным циклом
  // (sample_layout/sample_print/color_approval) для всех типов.
  // R13.0 (бриф 02.06): batch_layout удалён как дубль prepress.
  // sticker_kiss/big/rect больше не имеют packaging (упаковка стрейчем на OTK).
  // sticker3D получил drying+selection после pouring.

  it('sticker_cut с lamination и bopp_bag — полный маршрут включает sample workflow', () => {
    const route = getOrderRoute({ order_type: 'sticker_cut', need_lam: true, bopp_bag: true })
    expect(route).toContain('lamination')
    expect(route).toContain('sample_layout')
    expect(route).toContain('sample_print')
    expect(route).toContain('color_approval')
    expect(route).not.toContain('batch_layout')
    expect(route).toEqual([
      'new', 'design', 'sample_layout', 'sample_print', 'color_approval',
      'prepress', 'print', 'lamination', 'cutting', 'packaging', 'otk', 'done',
    ])
  })

  it('sticker_cut без BOPP пропускает packaging', () => {
    const route = getOrderRoute({ order_type: 'sticker_cut', need_lam: true, bopp_bag: false })
    expect(route).not.toContain('packaging')
    expect(route).toContain('cutting')
    expect(route).toContain('otk')
  })

  it('sticker_kiss никогда не включает packaging (упаковка стрейчем на OTK)', () => {
    const route = getOrderRoute({ order_type: 'sticker_kiss', need_lam: true, bopp_bag: true })
    expect(route).not.toContain('packaging')
    expect(route).toContain('otk')
  })

  it('big никогда не включает packaging', () => {
    const route = getOrderRoute({ order_type: 'big', need_lam: true, bopp_bag: true })
    expect(route).not.toContain('packaging')
  })

  it('rect никогда не включает packaging', () => {
    const route = getOrderRoute({ order_type: 'rect', need_lam: true, bopp_bag: true })
    expect(route).not.toContain('packaging')
  })

  it('3D stickerpack keeps packaging regardless of bopp_bag', () => {
    const route = getOrderRoute({ order_type: 'stickerpack3D', bopp_bag: false })
    expect(route).toContain('packaging')
  })

  it('regular order skips lamination when need_lam=false', () => {
    const route = getOrderRoute({ order_type: 'sticker_cut', need_lam: false })
    expect(route).not.toContain('lamination')
  })

  it('sticker3D имеет pouring → drying → selection → packaging, без lamination', () => {
    const route = getOrderRoute({ order_type: 'sticker3D' })
    expect(route).toContain('pouring')
    expect(route).toContain('drying')
    expect(route).toContain('selection')
    expect(route).toContain('packaging')
    expect(route).not.toContain('lamination')
    expect(route).not.toContain('selection_pouring')
    expect(route).not.toContain('assembly_3d')
    // Порядок: pouring → drying → selection → packaging
    const pourIdx = route.indexOf('pouring')
    const dryIdx = route.indexOf('drying')
    const selIdx = route.indexOf('selection')
    const packIdx = route.indexOf('packaging')
    expect(pourIdx).toBeLessThan(dryIdx)
    expect(dryIdx).toBeLessThan(selIdx)
    expect(selIdx).toBeLessThan(packIdx)
  })

  // R22.4 (ТЗ 20.07 Фаза 4Б): stickerpack3D переведён на линейный маршрут
  // с раздельными «Выборка → Заливка → Сушка». selection_pouring упразднён.
  it('stickerpack3D: раздельные selection/pouring/drying + assembly_3d, без selection_pouring', () => {
    const route = getOrderRoute({ order_type: 'stickerpack3D', need_lam: true })
    expect(route).not.toContain('selection_pouring')
    expect(route).toContain('selection')
    expect(route).toContain('pouring')
    expect(route).toContain('drying')
    expect(route).toContain('assembly_3d')
    expect(route).toContain('lamination')
  })

  it('3D stickerpack skips lamination when need_lam=false', () => {
    const route = getOrderRoute({ order_type: 'stickerpack3D', need_lam: false })
    expect(route).not.toContain('lamination')
    expect(route).not.toContain('selection_pouring')
    expect(route).toContain('selection')
  })

  it('fallback for unknown order type', () => {
    const route = getOrderRoute({ order_type: 'unknown' })
    expect(route[0]).toBe('new')
    expect(route[route.length - 1]).toBe('done')
  })

  it('skips design when design_status=provided (mockup from client)', () => {
    const route = getOrderRoute({ order_type: 'sticker_cut', need_lam: true, design_status: 'provided' })
    expect(route).not.toContain('design')
    expect(route).toContain('prepress')
    // sample_layout остаётся — это уже подготовка к печати (макет тиража)
    expect(route).toContain('sample_layout')
    // R13.0: batch_layout удалён из маршрута
    expect(route).not.toContain('batch_layout')
  })

  it('keeps design when design_status=needs_development', () => {
    const route = getOrderRoute({ order_type: 'sticker_cut', need_lam: true, design_status: 'needs_development' })
    expect(route).toContain('design')
  })

  it('skips both design and lamination when both flags set (bopp_bag for packaging)', () => {
    const route = getOrderRoute({ order_type: 'sticker_cut', need_lam: false, design_status: 'provided', bopp_bag: true })
    expect(route).not.toContain('design')
    expect(route).not.toContain('lamination')
    expect(route).toEqual([
      'new', 'sample_layout', 'sample_print', 'color_approval',
      'prepress', 'print', 'cutting', 'packaging', 'otk', 'done',
    ])
  })

  it('3D stickerpack with provided mockup skips design but keeps 3D stages', () => {
    const route = getOrderRoute({ order_type: 'stickerpack3D', need_lam: true, design_status: 'provided' })
    expect(route).not.toContain('design')
    expect(route).toContain('selection')
    expect(route).toContain('pouring')
    expect(route).toContain('assembly_3d')
  })
})

describe('isStageAllowed', () => {
  it('returns true for stages in route', () => {
    const order = { order_type: 'sticker_cut', need_lam: true }
    expect(isStageAllowed(order, 'print')).toBe(true)
    expect(isStageAllowed(order, 'lamination')).toBe(true)
  })

  it('returns false for 3D stages on regular order', () => {
    const order = { order_type: 'sticker_cut', need_lam: true }
    expect(isStageAllowed(order, 'pouring')).toBe(false)
    expect(isStageAllowed(order, 'selection_pouring')).toBe(false)
    expect(isStageAllowed(order, 'assembly_3d')).toBe(false)
  })

  it('returns false for design when design_status=provided', () => {
    const order = { order_type: 'sticker_cut', need_lam: true, design_status: 'provided' }
    expect(isStageAllowed(order, 'design')).toBe(false)
    expect(isStageAllowed(order, 'prepress')).toBe(true)
  })

  it('returns false for lamination when need_lam=false', () => {
    const order = { order_type: 'sticker_cut', need_lam: false }
    expect(isStageAllowed(order, 'lamination')).toBe(false)
  })

  it('handles null/undefined gracefully', () => {
    expect(isStageAllowed(null, 'print')).toBe(false)
    expect(isStageAllowed({ order_type: 'sticker_cut' }, null)).toBe(false)
  })
})

describe('R22.4 — упразднение selection_pouring / порядок меню', () => {
  it('«Выборка» идёт выше «Заливки» (.order)', () => {
    expect(ORDER_STATUSES.selection.order).toBeLessThan(ORDER_STATUSES.pouring.order)
    expect(ORDER_STATUSES.pouring.order).toBeLessThan(ORDER_STATUSES.drying.order)
  })

  it('устаревшие статусы сохранены с меткой «(устар.)» для истории', () => {
    expect(ORDER_STATUSES.selection_pouring.label).toContain('устар')
    expect(ORDER_STATUSES.batch_layout.label).toContain('устар')
  })

  it('sticker3D маршрут не изменился: pouring → drying → selection', () => {
    const route = getOrderRoute({ order_type: 'sticker3D', need_lam: false })
    const pi = route.indexOf('pouring')
    const di = route.indexOf('drying')
    const si = route.indexOf('selection')
    expect(pi).toBeGreaterThanOrEqual(0)
    expect(di).toBe(pi + 1)
    expect(si).toBe(di + 1)
  })

  it('getNextStatus: sticker3D drying → selection (по маршруту, не по .order)', () => {
    const order = { order_type: 'sticker3D', need_lam: false }
    expect(getNextStatus('post_printer', 'drying', order)).toBe('selection')
  })
})

describe('reprintViewLabel', () => {
  // R23.5: метка привязки допечатки к виду.
  it('stickerpack3D → «Вид #N»', () => {
    expect(reprintViewLabel('stickerpack3D', 2)).toBe('Вид #2')
  })
  it('прочие типы → «Размер #N»', () => {
    expect(reprintViewLabel('sticker_cut', 1)).toBe('Размер #1')
    expect(reprintViewLabel('sticker3D', 3)).toBe('Размер #3')
  })
  it('null/пусто → null (заказ с одним видом)', () => {
    expect(reprintViewLabel('stickerpack3D', null)).toBe(null)
    expect(reprintViewLabel('stickerpack3D', undefined)).toBe(null)
    expect(reprintViewLabel('sticker_cut', '')).toBe(null)
  })
})

describe('isDualTrack', () => {
  // R23.3 (ТЗ 23.07 Фаза 8.1/8.4): DUAL_TRACK_STAGES опустошён — печать и резка
  // stickerpack3D стали одиночными (одна плёнка). isDualTrack всегда false.
  it('false for stickerpack3D at print/cutting (dual-track снят в R23.3)', () => {
    const order = { order_type: 'stickerpack3D' }
    expect(isDualTrack('print', order)).toBe(false)
    expect(isDualTrack('cutting', order)).toBe(false)
    // R22.4: selection_pouring упразднён — тоже не dual-track.
    expect(isDualTrack('selection_pouring', order)).toBe(false)
  })

  it('false for stickerpack3D at other stages', () => {
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
  it('admin full path — sticker_cut с lamination + BOPP (включая sample workflow)', () => {
    const order = { order_type: 'sticker_cut', need_lam: true, bopp_bag: true }
    const path = [
      'new', 'design', 'sample_layout', 'sample_print', 'color_approval',
      'prepress', 'print', 'lamination', 'cutting', 'packaging', 'otk', 'done',
    ]
    for (let i = 0; i < path.length - 1; i++) {
      expect(getNextStatus('admin', path[i], order)).toBe(path[i + 1])
    }
  })

  it('admin full path — sticker_cut без lamination/BOPP (skip lamination+packaging)', () => {
    const order = { order_type: 'sticker_cut', need_lam: false, bopp_bag: false }
    const path = [
      'new', 'design', 'sample_layout', 'sample_print', 'color_approval',
      'prepress', 'print', 'cutting', 'otk', 'done',
    ]
    for (let i = 0; i < path.length - 1; i++) {
      expect(getNextStatus('admin', path[i], order)).toBe(path[i + 1])
    }
  })

  it('admin full path — sticker3D с drying+selection', () => {
    const order = { order_type: 'sticker3D', bopp_bag: false }
    const path = [
      'new', 'design', 'sample_layout', 'sample_print', 'color_approval',
      'prepress', 'print', 'cutting', 'pouring', 'drying', 'selection', 'packaging', 'otk', 'done',
    ]
    for (let i = 0; i < path.length - 1; i++) {
      expect(getNextStatus('admin', path[i], order)).toBe(path[i + 1])
    }
  })

  it('admin full path — stickerpack3D с lamination (R22.4: раздельные выборка/заливка/сушка)', () => {
    const order = { order_type: 'stickerpack3D', need_lam: true }
    const path = [
      'new', 'design', 'sample_layout', 'sample_print', 'color_approval',
      'prepress', 'print', 'lamination', 'cutting', 'selection', 'pouring', 'drying',
      'assembly_3d', 'packaging', 'otk', 'done',
    ]
    for (let i = 0; i < path.length - 1; i++) {
      expect(getNextStatus('admin', path[i], order)).toBe(path[i + 1])
    }
  })

  it('color_approval → prepress (R13.0 — batch_layout удалён как дубль prepress)', () => {
    const order = { order_type: 'sticker_cut', need_lam: true, bopp_bag: true }
    expect(getNextStatus('admin', 'color_approval', order)).toBe('prepress')
  })

  it('designer can advance sample_layout, design, prepress (R11.1)', () => {
    const order = { order_type: 'sticker_cut' }
    expect(getNextStatus('designer', 'design', order)).toBe('sample_layout')
    expect(getNextStatus('designer', 'sample_layout', order)).toBe('sample_print')
    expect(getNextStatus('designer', 'prepress', order)).toBe('print')
  })

  it('designer не может продвинуть color_approval (только менеджер согласовывает)', () => {
    const order = { order_type: 'sticker_cut' }
    expect(getNextStatus('designer', 'color_approval', order)).toBeUndefined()
  })

  it('designer cannot advance beyond prepress', () => {
    const order = { order_type: 'sticker_cut', need_lam: true }
    expect(getNextStatus('designer', 'print', order)).toBeUndefined()
    expect(getNextStatus('designer', 'cutting', order)).toBeUndefined()
  })

  it('printer может продвигать sample_print и далее через cutting (BOPP keeps packaging)', () => {
    const order = { order_type: 'sticker_cut', need_lam: true, bopp_bag: true }
    expect(getNextStatus('printer', 'sample_print', order)).toBe('color_approval')
    expect(getNextStatus('printer', 'prepress', order)).toBe('print')
    expect(getNextStatus('printer', 'print', order)).toBe('lamination')
    expect(getNextStatus('printer', 'lamination', order)).toBe('cutting')
    expect(getNextStatus('printer', 'cutting', order)).toBe('packaging')
  })

  it('post_printer может продвигать drying и selection (R11.1)', () => {
    const order3d = { order_type: 'sticker3D', bopp_bag: false }
    expect(getNextStatus('post_printer', 'drying', order3d)).toBe('selection')
    expect(getNextStatus('post_printer', 'selection', order3d)).toBe('packaging')
    expect(getNextStatus('post_printer', 'packaging', order3d)).toBe('otk')

    // stickerpack3D (R22.4): линейный маршрут selection→pouring→drying→assembly_3d
    const orderPack = { order_type: 'stickerpack3D', need_lam: true }
    expect(getNextStatus('post_printer', 'selection', orderPack)).toBe('pouring')
    expect(getNextStatus('post_printer', 'pouring', orderPack)).toBe('drying')
    expect(getNextStatus('post_printer', 'drying', orderPack)).toBe('assembly_3d')
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

  it('skips design when design_status=provided (R11.1: next — sample_layout)', () => {
    const order = { order_type: 'sticker_cut', need_lam: true, design_status: 'provided' }
    expect(getNextStatus('admin', 'new', order)).toBe('sample_layout')
  })

  it('returns nearest forward status when current is outside route', () => {
    // Заказ в pouring, но новый маршрут регулярный (без pouring). С BOPP — будет packaging.
    const order = { order_type: 'sticker_cut', need_lam: true, design_status: 'provided', bopp_bag: true }
    expect(getNextStatus('admin', 'pouring', order)).toBe('packaging')
  })

  it('returns nearest forward status when current is design but design skipped', () => {
    // Заказ застрял в design, но design_status сменили на provided.
    // R11.1: следующий валидный — sample_layout.
    const order = { order_type: 'sticker_cut', need_lam: true, design_status: 'provided' }
    expect(getNextStatus('admin', 'design', order)).toBe('sample_layout')
  })
})

describe('ORDER_STATUSES', () => {
  it('has 19 statuses (R11.0: +sample_layout/sample_print/color_approval/batch_layout/drying/selection)', () => {
    expect(Object.keys(ORDER_STATUSES)).toHaveLength(19)
  })

  it('order field is sequential 0-18', () => {
    const orders = Object.values(ORDER_STATUSES).map(s => s.order).sort((a, b) => a - b)
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])
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

  it('includes R11.0 sample workflow + drying + selection', () => {
    expect(ORDER_STATUSES.sample_layout).toBeDefined()
    expect(ORDER_STATUSES.sample_print).toBeDefined()
    expect(ORDER_STATUSES.color_approval).toBeDefined()
    expect(ORDER_STATUSES.batch_layout).toBeDefined()
    expect(ORDER_STATUSES.drying).toBeDefined()
    expect(ORDER_STATUSES.selection).toBeDefined()
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

describe('getFilmCostPerMeter', () => {
  it('returns cost for known film types', () => {
    expect(getFilmCostPerMeter('G')).toBe(130)
    expect(getFilmCostPerMeter('M')).toBe(130)
    expect(getFilmCostPerMeter('Holo')).toBe(240)
    expect(getFilmCostPerMeter('Gold')).toBe(670)
    expect(getFilmCostPerMeter('Chrome')).toBe(555)
    expect(getFilmCostPerMeter('Transparent_G')).toBe(130)
    expect(getFilmCostPerMeter('Transparent_M')).toBe(130)
  })

  it('returns 0 for unknown or null film type', () => {
    expect(getFilmCostPerMeter('unknown')).toBe(0)
    expect(getFilmCostPerMeter(null)).toBe(0)
    expect(getFilmCostPerMeter(undefined)).toBe(0)
  })
})

describe('calculateActualMaterialsCost', () => {
  it('returns zeros for empty logs', () => {
    const r = calculateActualMaterialsCost([], 'G')
    expect(r.total).toBe(0)
    expect(r.filmsTotal).toBe(0)
    expect(r.resinGrams).toBe(0)
    expect(r.films).toEqual({})
  })

  it('sums film_meters by film_type using fallback', () => {
    const logs = [
      { stage: 'print', film_meters: 10, film_type: 'G' },
      { stage: 'print', film_meters: 5, film_type: 'G' },
      { stage: 'print', film_meters: 3, film_type: 'Holo' },
    ]
    const r = calculateActualMaterialsCost(logs, 'G')
    expect(r.films.G).toBe(15)
    expect(r.films.Holo).toBe(3)
    expect(r.filmsTotal).toBe(15 * 130 + 3 * 240)
  })

  it('falls back to order film_type when log.film_type missing', () => {
    const logs = [{ stage: 'print', film_meters: 10 }]
    const r = calculateActualMaterialsCost(logs, 'M')
    expect(r.films.M).toBe(10)
    expect(r.filmsTotal).toBe(10 * 130)
  })

  it('aggregates resin grams from pouring/selection logs', () => {
    const logs = [
      { stage: 'pouring', resin_grams: 100 },
      { stage: 'selection_pouring', resin_grams: 50 },
    ]
    const r = calculateActualMaterialsCost(logs, 'G')
    expect(r.resinGrams).toBe(150)
    expect(r.resinCost).toBe(150 * RESIN_COST_PER_GRAM)
    expect(r.total).toBe(150 * RESIN_COST_PER_GRAM)
  })

  it('separates lamination meters in films map', () => {
    const logs = [{ stage: 'lamination', lamination_meters: 20 }]
    const r = calculateActualMaterialsCost(logs, 'G')
    expect(r.films.__lamination__).toBe(20)
    expect(r.filmsTotal).toBe(20 * 130)
  })
})

describe('calculateWorkerPayout', () => {
  it('returns zero for empty logs', () => {
    const r = calculateWorkerPayout([])
    expect(r.total).toBe(0)
    for (const v of Object.values(r.breakdown)) expect(v.amount).toBe(0)
  })

  it('calculates pouring at 1₽ per good sticker', () => {
    const logs = [
      { stage: 'pouring', stickers_good: 100 },
      { stage: 'pouring', stickers_good: 50 },
    ]
    const r = calculateWorkerPayout(logs)
    // R19: без shape-карт всё падает в 'standard'
    expect(r.breakdown.pouring_standard.count).toBe(150)
    expect(r.breakdown.pouring_standard.amount).toBe(150 * WORKER_RATES.pouring_per_sticker)
    expect(r.total).toBe(150)
  })

  it('selection_pouring counts pouring + selection (формула 17.05: bgs × per_pack × 0.5)', () => {
    // Без stickers_per_pack — fallback = 1: 100 фонов × 1 × 0.5 = 50 ₽
    const logs = [
      { stage: 'selection_pouring', qty_selected: 100, stickers_good: 80 },
    ]
    const r = calculateWorkerPayout(logs)
    expect(r.breakdown.selection.bgs).toBe(100)
    expect(r.breakdown.selection.count).toBe(100) // stickers (= bgs × 1)
    expect(r.breakdown.selection.amount).toBe(50)
    expect(r.breakdown.pouring_standard.count).toBe(80)
    expect(r.breakdown.pouring_standard.amount).toBe(80 * 1)
    expect(r.total).toBe(50 + 80)
  })

  it('selection × stickers_per_pack (фидбэк 17.05)', () => {
    // 50 фонов × 5 стикеров/пак × 0.5 ₽ = 125 ₽
    const logs = [
      { stage: 'selection_pouring', qty_selected: 50, stickers_good: 0, order: { stickers_per_pack: 5 } },
    ]
    const r = calculateWorkerPayout(logs)
    expect(r.breakdown.selection.bgs).toBe(50)
    expect(r.breakdown.selection.count).toBe(250)
    expect(r.breakdown.selection.amount).toBe(125)
    expect(r.total).toBe(125)
  })

  it('selection ordersById fallback', () => {
    const logs = [{ stage: 'selection_pouring', order_id: 'o1', qty_selected: 10, stickers_good: 0 }]
    const r = calculateWorkerPayout(logs, { ordersById: { o1: { stickers_per_pack: 6 } } })
    expect(r.breakdown.selection.amount).toBe(10 * 6 * 0.5)
  })

  // R22.7 (ТЗ 20.07 Фаза 8): для stickerpack3D «Выборка» (stage='selection') —
  // это выборка фонов, оплата ×stickers_per_pack (как selection_pouring).
  it('selection stickerpack3D: ×stickers_per_pack (выборка фонов)', () => {
    const logs = [{ stage: 'selection', order: { order_type: 'stickerpack3D', stickers_per_pack: 6 }, qty_selected: 10 }]
    const r = calculateWorkerPayout(logs)
    expect(r.breakdown.selection.amount).toBe(10 * 6 * 0.5)
  })

  it('selection sticker3D: штучная выборка ×1 (без stickers_per_pack)', () => {
    const logs = [{ stage: 'selection', order: { order_type: 'sticker3D', stickers_per_pack: 6 }, qty_selected: 10 }]
    const r = calculateWorkerPayout(logs)
    expect(r.breakdown.selection.amount).toBe(10 * 1 * 0.5)
  })

  it('packaging at 1.5₽ per pack', () => {
    const logs = [{ stage: 'packaging', packs_packaged: 20 }]
    const r = calculateWorkerPayout(logs)
    expect(r.breakdown.packaging.amount).toBe(30)
    expect(r.total).toBe(30)
  })

  it('assembly: packs × stickers_per_pack × 0.5₽ (формула обновлена 12.05)', () => {
    // 50 паков × 4 стикера/пак × 0.5 ₽ = 100 ₽
    const logs = [{ stage: 'assembly_3d', packs_assembled: 50, order: { stickers_per_pack: 4 } }]
    const r = calculateWorkerPayout(logs)
    expect(r.breakdown.assembly.count).toBe(200)   // stickers
    expect(r.breakdown.assembly.packs).toBe(50)
    expect(r.breakdown.assembly.amount).toBe(100)
    expect(r.total).toBe(100)
  })

  it('assembly: default stickers_per_pack=1 if order missing', () => {
    const logs = [{ stage: 'assembly_3d', packs_assembled: 50 }]
    const r = calculateWorkerPayout(logs)
    expect(r.breakdown.assembly.amount).toBe(25) // 50 × 1 × 0.5
  })

  it('assembly: ordersById fallback when no embed', () => {
    const logs = [{ stage: 'assembly_3d', order_id: 'o1', packs_assembled: 10 }]
    const r = calculateWorkerPayout(logs, { ordersById: { o1: { stickers_per_pack: 6 } } })
    expect(r.breakdown.assembly.amount).toBe(10 * 6 * 0.5)
  })

  it('mixed stages aggregate correctly', () => {
    const logs = [
      { stage: 'pouring', stickers_good: 100 },                                          // 100 ₽
      { stage: 'selection_pouring', qty_selected: 50, stickers_good: 0, order: { stickers_per_pack: 4 } }, // 50×4×0.5 = 100 ₽
      { stage: 'assembly_3d', packs_assembled: 20, order: { stickers_per_pack: 4 } },     // 20×4×0.5 = 40 ₽
      { stage: 'packaging', packs_packaged: 10 },                                         // 15 ₽
    ]
    const r = calculateWorkerPayout(logs)
    expect(r.total).toBe(100 + 100 + 40 + 15)
  })

  it('R14.6: stage=selection (sticker3D штучные) — qty_selected × 0.5 без stickers_per_pack', () => {
    // 100 штучных стикеров × 0.5 ₽ = 50 ₽, не зависит от stickers_per_pack заказа
    const logs = [
      { stage: 'selection', qty_selected: 100, order: { stickers_per_pack: 8 } },
    ]
    const r = calculateWorkerPayout(logs)
    expect(r.breakdown.selection.bgs).toBe(100)
    expect(r.breakdown.selection.count).toBe(100)
    expect(r.breakdown.selection.amount).toBe(50)
    expect(r.total).toBe(50)
  })

  it('R14.6: selection + selection_pouring смешанные — разная формула per stage', () => {
    const logs = [
      // sticker3D штучные: 100 × 1 × 0.5 = 50 ₽
      { stage: 'selection', qty_selected: 100, order: { stickers_per_pack: 8 } },
      // stickerpack3D фоны: 20 × 8 × 0.5 = 80 ₽
      { stage: 'selection_pouring', qty_selected: 20, order: { stickers_per_pack: 8 } },
    ]
    const r = calculateWorkerPayout(logs)
    expect(r.breakdown.selection.amount).toBe(50 + 80)
  })

  // ── R19: заливка по форме стикера ──
  it('R19: shapeByDesign — разные ставки заливки по форме', () => {
    const logs = [
      { stage: 'selection_pouring', order_id: 'o1', design_index: 1, qty_selected: 0, stickers_good: 10 }, // standard 1.0 → 10
      { stage: 'selection_pouring', order_id: 'o1', design_index: 2, qty_selected: 0, stickers_good: 10 }, // complex 1.5 → 15
      { stage: 'selection_pouring', order_id: 'o1', design_index: 3, qty_selected: 0, stickers_good: 10 }, // complex_big 2.0 → 20
    ]
    const r = calculateWorkerPayout(logs, {
      shapeByDesign: { 'o1:2': 'complex', 'o1:3': 'complex_big' },
    })
    expect(r.breakdown.pouring_standard.count).toBe(10)
    expect(r.breakdown.pouring_standard.amount).toBe(10)
    expect(r.breakdown.pouring_complex.amount).toBe(15)
    expect(r.breakdown.pouring_complex_big.amount).toBe(20)
    expect(r.total).toBe(10 + 15 + 20)
  })

  it('R19: orderShape — форма на уровне заказа (одиночный sticker3D)', () => {
    const logs = [{ stage: 'pouring', order_id: 'o9', stickers_good: 40 }]
    const r = calculateWorkerPayout(logs, { orderShape: { o9: 'big' } })
    expect(r.breakdown.pouring_big.count).toBe(40)
    expect(r.breakdown.pouring_big.amount).toBe(40 * 1.5)
    expect(r.total).toBe(60)
  })

  it('R19: shapeByDesign приоритетнее orderShape', () => {
    const logs = [{ stage: 'pouring', order_id: 'o1', design_index: 5, stickers_good: 10 }]
    const r = calculateWorkerPayout(logs, {
      shapeByDesign: { 'o1:5': 'complex_big' },
      orderShape: { o1: 'standard' },
    })
    expect(r.breakdown.pouring_complex_big.amount).toBe(20)
  })

  it('R19: opts.rates переопределяет ставки', () => {
    const logs = [{ stage: 'packaging', packs_packaged: 10 }]
    const r = calculateWorkerPayout(logs, { rates: { packaging_per_pack: 2 } })
    expect(r.breakdown.packaging.amount).toBe(20)
  })

  it('R19: opts.rates.pouring_by_shape переопределяет ставку формы', () => {
    const logs = [{ stage: 'pouring', order_id: 'o1', stickers_good: 10 }]
    const r = calculateWorkerPayout(logs, {
      orderShape: { o1: 'complex' },
      rates: { pouring_by_shape: { complex: 3 } },
    })
    expect(r.breakdown.pouring_complex.amount).toBe(30)
  })

  it('R19: settingsToRates переводит bonus_rates в форму WORKER_RATES', () => {
    const rates = settingsToRates({ pouring: 1, selection: 0.7, assembly_3d: 0.6, packaging: 2, pouring_shapes: { complex: 3 } })
    expect(rates.selection_per_sticker).toBe(0.7)
    expect(rates.assembly_per_pack).toBe(0.6)
    expect(rates.packaging_per_pack).toBe(2)
    expect(rates.pouring_by_shape.complex).toBe(3)
  })
})

describe('getMaterialCategory', () => {
  it('films → film_print', () => {
    expect(getMaterialCategory({ type: 'film', name: 'Пленка глянцевая' })).toBe('film_print')
  })
  it('lam_film → film_lam', () => {
    expect(getMaterialCategory({ type: 'lam_film', name: 'Ламинация матовая' })).toBe('film_lam')
  })
  it('resin → chemicals', () => {
    expect(getMaterialCategory({ type: 'resin', name: 'Смола' })).toBe('chemicals')
  })
  it('коробка → packaging', () => {
    expect(getMaterialCategory({ type: 'box', name: 'Коробка 280x160' })).toBe('packaging')
  })
  it('БОПП пакет с шириной > 100 → bopp_wide', () => {
    expect(getMaterialCategory({ type: 'packaging_bag', name: '110x150 пакет' })).toBe('bopp_wide')
  })
  it('БОПП пакет с шириной ≤ 100 → bopp_narrow', () => {
    expect(getMaterialCategory({ type: 'packaging_bag', name: '70x60 пакет' })).toBe('bopp_narrow')
  })
})

describe('getStockStatus', () => {
  it('zero stock → empty', () => {
    expect(getStockStatus({ stock_qty: 0, min_qty: 10 }).key).toBe('empty')
  })
  it('stock <= min → low', () => {
    expect(getStockStatus({ stock_qty: 5, min_qty: 10 }).key).toBe('low')
    expect(getStockStatus({ stock_qty: 10, min_qty: 10 }).key).toBe('low')
  })
  it('stock > min → ok', () => {
    expect(getStockStatus({ stock_qty: 50, min_qty: 10 }).key).toBe('ok')
  })
  it('without min → ok if positive', () => {
    expect(getStockStatus({ stock_qty: 5, min_qty: 0 }).key).toBe('ok')
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

describe('SUBTASK routes (R11.2)', () => {
  it('SUBTASK_ROUTE_STICKERS включает drying между pouring и ready', () => {
    expect(SUBTASK_ROUTE_STICKERS).toEqual(['pending', 'printing', 'cutting', 'pouring', 'drying', 'ready'])
  })

  it('SUBTASK_ROUTE_BACKGROUNDS не содержит drying (только стикеры сушатся)', () => {
    expect(SUBTASK_ROUTE_BACKGROUNDS).not.toContain('drying')
  })

  it('SUBTASK_STATUS_LABELS содержит лейбл для drying', () => {
    expect(SUBTASK_STATUS_LABELS.drying).toBe('Сушка')
  })

  it('getSubtaskRoute(stickers) — после pouring следующий статус drying', () => {
    const order = { order_type: 'stickerpack3D', need_lam: true }
    expect(getNextSubtaskStatus('stickers', 'pouring', order)).toBe('drying')
    expect(getNextSubtaskStatus('stickers', 'drying', order)).toBe('ready')
  })

  it('getSubtaskRoute(backgrounds) пропускает laminating при need_lam=false', () => {
    const order = { order_type: 'stickerpack3D', need_lam: false }
    expect(getSubtaskRoute('backgrounds', order)).not.toContain('laminating')
  })
})

describe('SUBTASK extra_stickers (R11.3)', () => {
  it('extra_stickers для 3D-типа — печать → резка → заливка → сушка → ready', () => {
    const order = { order_type: 'sticker3D' }
    expect(getSubtaskRoute('extra_stickers', order)).toEqual(['printing', 'cutting', 'pouring', 'drying', 'ready'])
  })

  it('extra_stickers для stickerpack3D — тот же 3D-маршрут', () => {
    const order = { order_type: 'stickerpack3D' }
    expect(getSubtaskRoute('extra_stickers', order)).toEqual(['printing', 'cutting', 'pouring', 'drying', 'ready'])
  })

  it('extra_stickers для плоского с lamination — печать → лам → резка → ready', () => {
    const order = { order_type: 'sticker_cut', need_lam: true }
    expect(getSubtaskRoute('extra_stickers', order)).toEqual(['printing', 'laminating', 'cutting', 'ready'])
  })

  it('extra_stickers для плоского без lamination — пропускаем laminating', () => {
    const order = { order_type: 'sticker_cut', need_lam: false }
    expect(getSubtaskRoute('extra_stickers', order)).toEqual(['printing', 'cutting', 'ready'])
  })

  it('getNextSubtaskStatus для extra_stickers 3D — printing → cutting', () => {
    const order = { order_type: 'sticker3D' }
    expect(getNextSubtaskStatus('extra_stickers', 'printing', order)).toBe('cutting')
    expect(getNextSubtaskStatus('extra_stickers', 'drying', order)).toBe('ready')
  })

  it('getNextSubtaskStatus для extra_stickers ready — null (конец)', () => {
    const order = { order_type: 'sticker3D' }
    expect(getNextSubtaskStatus('extra_stickers', 'ready', order)).toBe(null)
  })
})

// ─── QA 04.07: регрессии багов №3 (stage:new) ────────────────────────────
describe('canAdvanceFrom / stage:new (QA 04.07, баг №3)', () => {
  it('manager с динамическим правом stage:new может продвигать «Новый»', () => {
    const dynamicPerms = { manager: new Set(['stage:new']) }
    expect(canAdvanceFrom('manager', 'new', dynamicPerms)).toBe(true)
  })

  it('без права stage:new продвижение из «Новый» запрещено', () => {
    const dynamicPerms = { printer: new Set(['stage:print']) }
    expect(canAdvanceFrom('printer', 'new', dynamicPerms)).toBe(false)
  })

  it('stage:new входит в PERMISSIONS.stages (виден в редакторе прав)', () => {
    expect(PERMISSIONS.stages).toContain('stage:new')
  })

  it('у каждого права из PERMISSIONS есть человекочитаемый лейбл', () => {
    // Инвариант ловит забытые PERMISSION_LABELS при добавлении новых прав.
    const all = Object.values(PERMISSIONS).flat()
    for (const perm of all) {
      expect(PERMISSION_LABELS[perm], `нет лейбла для ${perm}`).toBeTruthy()
    }
  })
})
