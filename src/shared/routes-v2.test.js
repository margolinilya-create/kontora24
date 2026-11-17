// R25.1 (ТЗ 17.11 Фаза 1): маршруты версии 2, правила «Ждёт оплаты»,
// гейт допечаток на выходе с ТК, оплата обязательной упаковки, полнота
// статусов по отделам / бакетам планировщика / цветам.
import { describe, it, expect } from 'vitest'
import {
  getOrderRoute, getReprintRoute, getNextStatus, isStageAllowed, getRouteVersion, isRouteV2,
  isOrderPaid, needsNoPaymentConfirm, getAutoPassTarget, isReprintGateTransition,
  isPackagingPaid, computeLogPayout, calculateWorkerPayout, resolvePayoutRates,
  ORDER_STATUSES, ACTIVE_ORDER_STATUSES, SALES_STAGES, PERMISSIONS, PERMISSION_LABELS,
  NAV_ITEMS, NOTIFY_ROLES, canAdvanceFrom, ROUTE_SUBCONTRACT_V2,
  canToggleSubcontract, canCreateReprint, canRollbackReprintForOrder,
} from './constants'
import { DEPARTMENTS, DEPT_GROUPS, ORG_DEPARTMENTS, getDepartment, getStageDeptToken } from './lib/department-mapping'
import { STAGE_TO_BUCKET, BUCKETS } from '@/features/production-planner/lib/buckets'

const HEAD = ['new', 'awaiting_payment', 'design', 'design_approval', 'sample_layout', 'sample_print', 'color_approval', 'prepress']
const TAIL_PICKUP = ['otk', 'awaiting_pickup', 'done']
const TAIL_DELIVERY = ['otk', 'awaiting_pickup', 'delivery', 'done']
const FLAT = ['print', 'lamination', 'cutting', 'packaging']

const v2 = (extra) => ({
  route_version: 2,
  design_status: 'needs_development',
  need_lam: true,
  bopp_bag: false,
  delivery_type: 'pickup',
  ...extra,
})

describe('R25.1: версия маршрута', () => {
  it('getRouteVersion: 2 только при явном route_version >= 2', () => {
    expect(getRouteVersion({})).toBe(1)
    expect(getRouteVersion({ route_version: null })).toBe(1)
    expect(getRouteVersion({ route_version: 1 })).toBe(1)
    expect(getRouteVersion({ route_version: 2 })).toBe(2)
    expect(getRouteVersion(null)).toBe(1)
    expect(isRouteV2({ route_version: 2 })).toBe(true)
  })
})

describe('R25.1: маршруты v2 (таблица 1.2)', () => {
  it.each(['sticker_cut', 'stickerpack', 'sticker_kiss', 'rect', 'big'])('%s: голова + печать/ламинация/резка/упаковка + хвост', (t) => {
    expect(getOrderRoute(v2({ order_type: t }))).toEqual([...HEAD, ...FLAT, ...TAIL_PICKUP])
  })

  it('упаковка не зависит от БОПП', () => {
    for (const t of ['sticker_cut', 'sticker_kiss', 'rect', 'big', 'stickerpack']) {
      expect(getOrderRoute(v2({ order_type: t, bopp_bag: false }))).toContain('packaging')
      expect(getOrderRoute(v2({ order_type: t, bopp_bag: true }))).toContain('packaging')
    }
  })

  it('3D стикер', () => {
    expect(getOrderRoute(v2({ order_type: 'sticker3D', need_lam: false }))).toEqual([
      ...HEAD, 'print', 'cutting', 'pouring', 'drying', 'selection', 'packaging', ...TAIL_PICKUP,
    ])
  })

  it('3D стикерпак', () => {
    expect(getOrderRoute(v2({ order_type: 'stickerpack3D' }))).toEqual([
      ...HEAD, 'print', 'lamination', 'cutting', 'selection', 'pouring', 'drying', 'assembly_3d', 'packaging', ...TAIL_PICKUP,
    ])
  })

  it('«Прочее» — универсальный маршрут без автопропусков цеха', () => {
    expect(getOrderRoute(v2({ order_type: 'other' }))).toEqual([
      ...HEAD, 'print', 'lamination', 'cutting', 'selection', 'pouring', 'drying', 'assembly_3d', 'packaging', ...TAIL_PICKUP,
    ])
  })

  it('неизвестный тип → маршрут вырубного стикера', () => {
    expect(getOrderRoute(v2({ order_type: 'zzz' }))).toEqual(getOrderRoute(v2({ order_type: 'sticker_cut' })))
  })

  it('макет от клиента → нет «Дизайна» и «Утверждения дизайна»', () => {
    const r = getOrderRoute(v2({ order_type: 'sticker_cut', design_status: 'provided' }))
    expect(r).not.toContain('design')
    expect(r).not.toContain('design_approval')
    expect(r).toContain('awaiting_payment')
  })

  it('ламинация: пропуск только без ламинации И без монтажной плёнки', () => {
    expect(getOrderRoute(v2({ order_type: 'sticker_cut', need_lam: false }))).not.toContain('lamination')
    expect(getOrderRoute(v2({ order_type: 'sticker_cut', need_lam: false, needs_montage_film: true }))).toContain('lamination')
    expect(getOrderRoute(v2({ order_type: 'sticker_cut', need_lam: true }))).toContain('lamination')
  })

  it('доставка: этап только при delivery_type=delivery', () => {
    expect(getOrderRoute(v2({ order_type: 'sticker_cut', delivery_type: 'delivery' })).slice(-4)).toEqual(TAIL_DELIVERY)
    expect(getOrderRoute(v2({ order_type: 'sticker_cut', delivery_type: 'pickup' }))).not.toContain('delivery')
    expect(getOrderRoute(v2({ order_type: 'sticker_cut', delivery_type: null }))).not.toContain('delivery')
  })

  it('«Ждёт оплаты» и «Упаковка» есть всегда; «Субподряд» — только у субподряда', () => {
    for (const t of ['sticker_cut', 'sticker_kiss', 'stickerpack', 'sticker3D', 'stickerpack3D', 'rect', 'big', 'other']) {
      for (const need_lam of [true, false]) {
        for (const design_status of ['provided', 'needs_development']) {
          const r = getOrderRoute(v2({ order_type: t, need_lam, design_status }))
          expect(r).toContain('awaiting_payment')
          expect(r).toContain('packaging')
          expect(r).not.toContain('subcontract')
          expect(r[r.length - 1]).toBe('done')
          expect(r.indexOf('otk')).toBeLessThan(r.indexOf('awaiting_pickup'))
        }
      }
    }
  })

  it('субподряд: продажи + дизайн → субподряд → упаковка → хвост, без образца и цеха', () => {
    expect(getOrderRoute(v2({ order_type: 'sticker3D', is_subcontract: true }))).toEqual([
      'new', 'awaiting_payment', 'design', 'design_approval', 'subcontract', 'packaging', ...TAIL_PICKUP,
    ])
    expect(getOrderRoute(v2({ order_type: 'sticker_cut', is_subcontract: true, design_status: 'provided', delivery_type: 'delivery' }))).toEqual([
      'new', 'awaiting_payment', 'subcontract', 'packaging', ...TAIL_DELIVERY,
    ])
    expect(ROUTE_SUBCONTRACT_V2).toContain('subcontract')
  })

  it('getNextStatus / isStageAllowed работают по маршруту v2', () => {
    const o = v2({ order_type: 'sticker_cut' })
    expect(getNextStatus('admin', 'new', o)).toBe('awaiting_payment')
    expect(getNextStatus('admin', 'otk', o)).toBe('awaiting_pickup')
    expect(getNextStatus('admin', 'awaiting_pickup', o)).toBe('done')
    expect(getNextStatus('admin', 'awaiting_pickup', { ...o, delivery_type: 'delivery' })).toBe('delivery')
    expect(isStageAllowed(o, 'awaiting_payment')).toBe(true)
    expect(isStageAllowed({ ...o, route_version: 1 }, 'awaiting_payment')).toBe(false)
  })
})

describe('R25.1: getReprintRoute v2', () => {
  it('производственная часть от печати до ТК, без хвоста v2', () => {
    expect(getReprintRoute(v2({ order_type: 'sticker_cut', delivery_type: 'delivery' }))).toEqual([...FLAT, 'done'])
    expect(getReprintRoute(v2({ order_type: 'sticker3D', need_lam: false }))).toEqual(['print', 'cutting', 'pouring', 'drying', 'selection', 'packaging', 'done'])
  })

  it('3D стикерпак: ламинация по lam || монтажная плёнка', () => {
    expect(getReprintRoute(v2({ order_type: 'stickerpack3D', need_lam: false }))).not.toContain('lamination')
    expect(getReprintRoute(v2({ order_type: 'stickerpack3D', need_lam: false, needs_montage_film: true }))).toContain('lamination')
  })

  it('субподряд: печати нет → только done', () => {
    expect(getReprintRoute(v2({ order_type: 'sticker_cut', is_subcontract: true }))).toEqual(['done'])
  })
})

describe('R25.1: «Ждёт оплаты» (1.3)', () => {
  it('isOrderPaid: всё кроме not_paid / пусто, включая бартер', () => {
    expect(isOrderPaid({ payment_status: 'not_paid' })).toBe(false)
    expect(isOrderPaid({ payment_status: null })).toBe(false)
    expect(isOrderPaid({})).toBe(false)
    expect(isOrderPaid({ payment_status: 'barter' })).toBe(true)
    expect(isOrderPaid({ payment_status: 'cash' })).toBe(true)
  })

  it('автопроход: оплата отмечена при приёме → следующий этап после «Ждёт оплаты»', () => {
    const paid = v2({ order_type: 'sticker_cut', payment_status: 'sbp_tochka' })
    expect(getAutoPassTarget(paid, 'new', 'awaiting_payment')).toBe('design')
    expect(getAutoPassTarget({ ...paid, design_status: 'provided' }, 'new', 'awaiting_payment')).toBe('sample_layout')
    expect(getAutoPassTarget({ ...paid, payment_status: 'not_paid' }, 'new', 'awaiting_payment')).toBeNull()
    expect(getAutoPassTarget({ ...paid, route_version: 1 }, 'new', 'awaiting_payment')).toBeNull()
    expect(getAutoPassTarget(paid, 'design', 'awaiting_payment')).toBeNull()
  })

  it('подтверждение «без оплаты» — только при выходе вперёд за этап без оплаты', () => {
    const unpaid = v2({ order_type: 'sticker_cut', payment_status: 'not_paid' })
    expect(needsNoPaymentConfirm(unpaid, 'awaiting_payment', 'design')).toBe(true)
    expect(needsNoPaymentConfirm(unpaid, 'new', 'design')).toBe(true) // перескок через этап (канбан)
    expect(needsNoPaymentConfirm(unpaid, 'new', 'awaiting_payment')).toBe(false)
    expect(needsNoPaymentConfirm(unpaid, 'design', 'prepress')).toBe(false)
    expect(needsNoPaymentConfirm({ ...unpaid, payment_status: 'cash' }, 'awaiting_payment', 'design')).toBe(false)
    expect(needsNoPaymentConfirm({ ...unpaid, route_version: 1 }, 'new', 'design')).toBe(false)
  })
})

describe('R25.1: гейт допечаток (1.5)', () => {
  it('v1 — только вход в done', () => {
    const o = { order_type: 'sticker_cut' }
    expect(isReprintGateTransition(o, 'otk', 'done')).toBe(true)
    expect(isReprintGateTransition(o, 'packaging', 'otk')).toBe(false)
  })
  it('v2 — выход с ТК вперёд и любой вход в done', () => {
    const o = v2({ order_type: 'sticker_cut' })
    expect(isReprintGateTransition(o, 'otk', 'awaiting_pickup')).toBe(true)
    expect(isReprintGateTransition(o, 'otk', 'delivery')).toBe(true)
    expect(isReprintGateTransition(o, 'awaiting_pickup', 'done')).toBe(true)
    expect(isReprintGateTransition(o, 'otk', 'packaging')).toBe(false)
    expect(isReprintGateTransition(o, 'packaging', 'otk')).toBe(false)
  })
  it('ревью R25: v2 — прыжок мимо ТК вперёд тоже гейт, хвост после ТК — нет', () => {
    const o = v2({ order_type: 'sticker_cut', delivery_type: 'delivery' })
    expect(isReprintGateTransition(o, 'packaging', 'awaiting_pickup')).toBe(true)
    expect(isReprintGateTransition(o, 'print', 'delivery')).toBe(true)
    expect(isReprintGateTransition(o, 'awaiting_pickup', 'delivery')).toBe(false)
    expect(isReprintGateTransition(o, 'awaiting_pickup', 'otk')).toBe(false)
    expect(isReprintGateTransition(o, 'print', 'cutting')).toBe(false)
  })
})

describe('ревью R25: субподряд и допечатки', () => {
  it('canToggleSubcontract: без route_version — v1, переключать нельзя', () => {
    expect(canToggleSubcontract({ status: 'new' })).toBe(false)
    expect(canToggleSubcontract({ status: 'new', route_version: null })).toBe(false)
    expect(canToggleSubcontract({ status: 'new', route_version: 2 })).toBe(true)
    expect(canToggleSubcontract({ status: 'print', route_version: 2 })).toBe(false)
  })
  it('canCreateReprint: субподряд v2 — запрет', () => {
    expect(canCreateReprint(v2({ order_type: 'sticker_cut', is_subcontract: true })).ok).toBe(false)
    expect(canCreateReprint(v2({ order_type: 'sticker_cut' })).ok).toBe(true)
    expect(canCreateReprint({ order_type: 'sticker_cut' }).ok).toBe(true)
  })
  it('canRollbackReprintForOrder: до ТК — да, на ТК и после — нет', () => {
    expect(canRollbackReprintForOrder({ status: 'packaging' })).toBe(true)
    for (const st of ['otk', 'awaiting_pickup', 'delivery', 'done', 'cancelled']) {
      expect(canRollbackReprintForOrder({ status: st })).toBe(false)
    }
  })
})

describe('R25.1: оплата обязательной упаковки (1.6)', () => {
  const rates = resolvePayoutRates()
  const log = { stage: 'packaging', packs_packaged: 10 }

  it('isPackagingPaid', () => {
    expect(isPackagingPaid(null)).toBe(true)
    expect(isPackagingPaid({ order_type: 'sticker_kiss' })).toBe(true) // нет версии → как v1
    expect(isPackagingPaid({ order_type: 'sticker_kiss', route_version: 1 })).toBe(true)
    expect(isPackagingPaid({ order_type: 'sticker_kiss', route_version: 2, bopp_bag: false })).toBe(false)
    expect(isPackagingPaid({ order_type: 'sticker_kiss', route_version: 2, bopp_bag: true })).toBe(true)
    expect(isPackagingPaid({ order_type: 'sticker3D', route_version: 2 })).toBe(true)
    expect(isPackagingPaid({ order_type: 'stickerpack3D', route_version: 2 })).toBe(true)
  })

  it('стикер на подложке v2 без БОПП — 0 ₽; с БОПП и 3D — 1,5 ₽/шт', () => {
    expect(computeLogPayout(log, { order_type: 'sticker_kiss', route_version: 2, bopp_bag: false }, rates)).toEqual([])
    expect(computeLogPayout(log, { order_type: 'sticker_kiss', route_version: 2, bopp_bag: true }, rates))
      .toEqual([{ category: 'packaging', qty: 10, units: 10, rate: 1.5, amount: 15 }])
    expect(computeLogPayout(log, { order_type: 'sticker3D', route_version: 2 }, rates)[0].amount).toBe(15)
  })

  it('v1 и логи без версии оплачиваются как раньше', () => {
    expect(computeLogPayout(log, { order_type: 'sticker_kiss', route_version: 1, bopp_bag: false }, rates)[0].amount).toBe(15)
    expect(computeLogPayout(log, null, rates)[0].amount).toBe(15)
  })

  it('calculateWorkerPayout применяет то же правило через ordersById', () => {
    const logs = [
      { order_id: 'a', stage: 'packaging', packs_packaged: 10 },
      { order_id: 'b', stage: 'packaging', packs_packaged: 4 },
    ]
    const ordersById = {
      a: { order_type: 'sticker_kiss', route_version: 2, bopp_bag: false },
      b: { order_type: 'sticker_kiss', route_version: 1, bopp_bag: false },
    }
    expect(calculateWorkerPayout(logs, { ordersById }).breakdown.packaging).toMatchObject({ count: 4, amount: 6 })
  })
})

describe('R25.1: полнота статусов (тест-«сторож»)', () => {
  const ALL = Object.keys(ORDER_STATUSES)

  it('5 новых статусов с подписями «Новый заказ» и «ТК»', () => {
    for (const s of ['awaiting_payment', 'design_approval', 'subcontract', 'awaiting_pickup', 'delivery']) {
      expect(ORDER_STATUSES[s]).toBeDefined()
    }
    expect(ORDER_STATUSES.new.label).toBe('Новый заказ')
    expect(ORDER_STATUSES.otk.label).toBe('ТК')
  })

  it('канонический порядок ТЗ 1.1', () => {
    const ordered = [...ALL].sort((a, b) => ORDER_STATUSES[a].order - ORDER_STATUSES[b].order)
    expect(ordered).toEqual([
      'new', 'awaiting_payment', 'design', 'design_approval', 'sample_layout', 'sample_print',
      'color_approval', 'batch_layout', 'prepress', 'subcontract', 'print', 'lamination', 'cutting',
      'selection', 'pouring', 'drying', 'selection_pouring', 'assembly_3d', 'packaging', 'otk',
      'awaiting_pickup', 'delivery', 'done', 'cancelled',
    ])
    expect(new Set(ALL.map((s) => ORDER_STATUSES[s].order)).size).toBe(ALL.length)
  })

  it('каждый статус (кроме cancelled) есть в отделах и в группах цветов', () => {
    const inDepts = new Set(ORG_DEPARTMENTS.flatMap((d) => [...d.stages.map((s) => s.status), ...(d.legacyStatuses || [])]))
    const inGroups = new Set(Object.values(DEPT_GROUPS).flatMap((g) => g.stages))
    for (const s of ALL.filter((x) => x !== 'cancelled')) {
      expect(inDepts.has(s), `отдел для ${s}`).toBe(true)
      expect(inGroups.has(s), `группа для ${s}`).toBe(true)
      expect(getStageDeptToken(s), `токен для ${s}`).toBeTruthy()
    }
  })

  it('статус принадлежит ровно одному отделу (сборка 3D — ОСК)', () => {
    const seen = {}
    for (const d of ORG_DEPARTMENTS) {
      for (const s of [...d.stages.map((x) => x.status), ...(d.legacyStatuses || [])]) {
        expect(seen[s], `${s} в двух отделах`).toBeUndefined()
        seen[s] = d.id
      }
    }
    expect(getDepartment('assembly_3d').departmentId).toBe('osk')
    expect(DEPT_GROUPS.finish.stages).toContain('assembly_3d')
    expect(DEPT_GROUPS.pouring.stages).not.toContain('assembly_3d')
  })

  it('отдел продаж — синий (токен info) и содержит этапы ОП', () => {
    expect(DEPARTMENTS[0].id).toBe('sales')
    // «Утверждение дизайна» — вкладка раздела «Продажи», но отдел — ОДП (таблица 1.1).
    const salesDept = SALES_STAGES.filter((s) => s !== 'design_approval')
    for (const s of salesDept) expect(getDepartment(s).departmentId).toBe('sales')
    for (const s of salesDept) expect(getStageDeptToken(s)).toBe('info')
    expect(getDepartment('design_approval').departmentId).toBe('prepress')
  })

  it('каждый статус есть в bucket-маппинге планировщика; новые этапы — вехи', () => {
    for (const s of ALL) expect(STAGE_TO_BUCKET[s], `бакет для ${s}`).toBeDefined()
    for (const s of ['awaiting_payment', 'design_approval', 'subcontract', 'awaiting_pickup', 'delivery']) {
      expect(STAGE_TO_BUCKET[s]).toBe(BUCKETS.milestone)
    }
  })

  it('ACTIVE_ORDER_STATUSES — все кроме done/cancelled в каноническом порядке', () => {
    expect(ACTIVE_ORDER_STATUSES).not.toContain('done')
    expect(ACTIVE_ORDER_STATUSES).not.toContain('cancelled')
    expect(ACTIVE_ORDER_STATUSES).toHaveLength(ALL.length - 2)
    expect(ACTIVE_ORDER_STATUSES[0]).toBe('new')
  })
})

describe('R25.1: права, уведомления, меню', () => {
  it('новые права и подписи (В.1)', () => {
    for (const p of ['stage:awaiting_payment', 'stage:design_approval', 'stage:subcontract', 'stage:awaiting_pickup', 'stage:delivery']) {
      expect(PERMISSIONS.stages).toContain(p)
      expect(PERMISSION_LABELS[p]).toBeTruthy()
    }
    expect(PERMISSIONS.views).toContain('view:sales')
    expect(PERMISSION_LABELS['view:sales']).toBe('Видеть «Продажи»')
    expect(PERMISSION_LABELS['stage:otk']).toBe('Продвигать «ТК»')
  })

  it('новые этапы ОП продвигают admin/manager, но не цех (статический фолбэк)', () => {
    for (const s of ['awaiting_payment', 'design_approval', 'subcontract', 'awaiting_pickup', 'delivery']) {
      expect(canAdvanceFrom('manager', s)).toBe(true)
      expect(canAdvanceFrom('admin', s)).toBe(true)
      for (const r of ['designer', 'printer', 'post_printer']) expect(canAdvanceFrom(r, s)).toBe(false)
      expect(NOTIFY_ROLES[s]).toEqual(['manager'])
    }
  })

  it('пункт «Продажи» сразу после «Заказов»; меню «ТК»', () => {
    const idx = NAV_ITEMS.findIndex((i) => i.path === '/orders')
    expect(NAV_ITEMS[idx + 1]).toMatchObject({ path: '/sales', label: 'Продажи', permission: 'view:sales' })
    expect(NAV_ITEMS.find((i) => i.path === '/production/otk').label).toBe('ТК')
  })
})
