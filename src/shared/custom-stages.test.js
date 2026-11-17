// R25.7D (ТЗ 17.11, Фаза 7.4–7.6, 7.9): свои этапы и ставки своих типов.
// Фикстура: свой этап «Термоперенос» (custom_1, отдел печати) и свой тип
// «Магниты» = Печать → Термоперенос → Резка (+ хвост с упаковкой).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'
import {
  ORDER_STATUSES, getStatusMeta, getOrderRoute, getReprintRoute, getNextStatus, canAdvanceFrom,
  computeLogPayout, calculateWorkerPayout, resolvePayoutRates, getPermissionList, getPermissionLabel,
  getActiveOrderStatuses, ACTIVE_ORDER_STATUSES, PERMISSIONS,
} from './constants'
import {
  registerRouteRegistry, resetRouteRegistry, buildRouteSnapshot, isCustomStageKey,
} from './lib/route-registry'
import {
  getDepartment, getStageDeptToken, getStageGroupKey, getStatusesForDepartment, insertCustomStageColumns,
} from './lib/department-mapping'
import { getBucketForStage, BUCKETS } from '@/features/production-planner/lib/buckets'
import { getStageDurationHours } from '@/features/production-planner/lib/planner'
import {
  STAGE_FIELDS, computeStageProgress, computeIncoming, validateLogEntry, fieldValueLabel,
  otkDefectStagesForRoute, sumOtkDefectsByStage, applyOtkDefects, buildOtkReprintComment,
  computeSubtaskStageProgress, buildOtkLogPayloads,
} from '@/features/production/lib/production-logs'
import { customQueueConfig, withCustomStageNavItems, customStagePath } from '@/features/production/lib/queue-config'
import { getKanbanColumns } from '@/features/production/lib/kanban-columns'
import { NAV_ITEMS } from './constants'

const THERMO = {
  key: 'custom_1', name: 'Термоперенос', department: 'print', norm_per_8h: 400,
  show_in_menu: true, otk_defect: true, sort_order: 10, archived_at: null,
}
const MILESTONE = {
  key: 'custom_2', name: 'Согласование упаковки', department: 'osk', norm_per_8h: null,
  show_in_menu: false, otk_defect: false, sort_order: 20, archived_at: null,
}
const MAGNETS = {
  key: 'type_1', name: 'Магниты', short_name: 'Магниты', is_builtin: false, is_set: false,
  head: { sample: false, prepress: true },
  production: ['print', 'custom_1', 'cutting'],
  locked_blocks: [], default_production: null,
  rates: { print: { rate: 0.5, base: 'item' }, custom_1: { rate: 2, base: 'item' }, packaging: { rate: 1, base: 'item' } },
  sort_order: 100, archived_at: null,
}
const MAGNET_SETS = {
  ...MAGNETS, key: 'type_2', name: 'Наборы магнитов', is_set: true,
  rates: { custom_1: { rate: 0.1, base: 'sticker' }, packaging: { rate: 1, base: 'item' } },
}

function magnetOrder(extra = {}) {
  return {
    id: 'o1', order_type: 'type_1', route_version: 2, status: 'print', qty: 100,
    design_status: 'needs_development', delivery_type: 'pickup', need_lam: false,
    route_snapshot: buildRouteSnapshot(MAGNETS, '2026-11-17T00:00:00Z'),
    ...extra,
  }
}

beforeEach(() => registerRouteRegistry({ types: [MAGNETS, MAGNET_SETS], stages: [THERMO, MILESTONE] }))
afterEach(() => resetRouteRegistry())

describe('guard: каждый статус и свой этап разрешаются в отдел / бакет / подпись', () => {
  const LEGACY = ['batch_layout', 'selection_pouring']
  const keys = Object.keys(ORDER_STATUSES).filter((k) => !LEGACY.includes(k))

  it('встроенные статусы (кроме устаревших и «Отменён»): getStatusMeta, отдел, бакет', () => {
    for (const k of keys) {
      expect(getStatusMeta(k), k).toBeTruthy()
      expect(Object.values(BUCKETS), k).toContain(getBucketForStage(k))
      if (k !== 'cancelled') expect(getDepartment(k), k).toBeTruthy()
    }
  })

  it('свой этап с нормой: подпись, отдел печати, бакет печати, очередь', () => {
    expect(isCustomStageKey('custom_1')).toBe(true)
    expect(getStatusMeta('custom_1')).toMatchObject({ label: 'Термоперенос', custom: true })
    expect(getDepartment('custom_1')).toMatchObject({ departmentId: 'print', stageLabel: 'Термоперенос' })
    expect(getStageDeptToken('custom_1')).toBe('dept-print')
    expect(getStageGroupKey('custom_1')).toBe('print')
    expect(getStatusesForDepartment('print')).toContain('custom_1')
    expect(getBucketForStage('custom_1')).toBe(BUCKETS.oprl_print)
    expect(customQueueConfig('custom_1')).toMatchObject({ title: 'Термоперенос', status: 'custom_1' })
  })

  it('свой этап без нормы — веха планировщика; неизвестный ключ — null', () => {
    expect(getBucketForStage('custom_2')).toBe(BUCKETS.milestone)
    expect(getStatusMeta('custom_99')).toBeNull()
    expect(customQueueConfig('custom_99')).toBeNull()
    expect(customQueueConfig('print')).toBeNull()
    expect(getDepartment('custom_99')).toBeNull()
  })

  it('планировщик: длительность своего этапа = тираж / норма × 8 ч; веха — 0', () => {
    expect(getStageDurationHours('custom_1', { qty: 200 }, [], {})).toBeCloseTo(4)
    expect(getStageDurationHours('custom_2', { qty: 200 }, [], {})).toBe(0)
  })

  it('канбан: свой этап — после последней колонки своего отдела', () => {
    const cols = getKanbanColumns()
    expect(cols.indexOf('custom_1')).toBe(cols.indexOf('cutting') + 1)
    expect(cols.indexOf('custom_2')).toBe(cols.indexOf('otk') + 1)
    // Архивный этап в колонки не попадает.
    expect(insertCustomStageColumns(['print', 'cutting'], [{ ...THERMO, archived_at: '2026-11-01' }])).toEqual(['print', 'cutting'])
  })

  it('меню: свой этап с «Показывать в меню» — после «Резки», право stage:<ключ>', () => {
    const items = withCustomStageNavItems(NAV_ITEMS)
    const at = items.findIndex((i) => i.path === customStagePath('custom_1'))
    expect(items[at - 1].path).toBe('/production/cutting')
    expect(items[at]).toMatchObject({ permission: 'stage:custom_1', label: 'Термоперенос' })
    expect(items.some((i) => i.path === customStagePath('custom_2'))).toBe(false)
  })

  it('права ролей: секция этапов дополняется stage:custom_<N>, статичный PERMISSIONS не мутируется', () => {
    expect(getPermissionList('stages')).toEqual([...PERMISSIONS.stages, 'stage:custom_1', 'stage:custom_2'])
    expect(PERMISSIONS.stages).not.toContain('stage:custom_1')
    expect(getPermissionLabel('stage:custom_1')).toBe('Продвигать «Термоперенос»')
    expect(getPermissionLabel('view:finance')).toBeTruthy()
  })

  it('активные статусы для списков включают свои этапы (стабильная ссылка)', () => {
    const a = getActiveOrderStatuses()
    expect(a).toEqual([...ACTIVE_ORDER_STATUSES, 'custom_1', 'custom_2'])
    expect(getActiveOrderStatuses()).toBe(a)
    resetRouteRegistry()
    expect(getActiveOrderStatuses()).toBe(ACTIVE_ORDER_STATUSES)
  })
})

describe('форма учёта и прогресс своего этапа', () => {
  it('STAGE_FIELDS[custom] — «Выполнено» + «Брак»; ключи встроенных не меняются', () => {
    expect(STAGE_FIELDS.custom_1.label).toBe('Термоперенос')
    expect(STAGE_FIELDS.custom_1.quantityField).toBe('qty_done')
    expect(STAGE_FIELDS.custom_1.fields.map((f) => f.key)).toEqual(['qty_done', 'defects'])
    expect(Object.keys(STAGE_FIELDS)).not.toContain('custom_1')
    expect('custom_1' in STAGE_FIELDS).toBe(false)
    expect(STAGE_FIELDS.unknown_stage).toBeUndefined()
    expect(typeof STAGE_FIELDS.hasOwnProperty).toBe('function')
  })

  it('прогресс = выполнено − брак от тиража (как check_stage_completion v8)', () => {
    const logs = [
      { stage: 'custom_1', qty_done: 60, defects: 2 },
      { stage: 'custom_1', qty_done: 45, defects: 3 },
      { stage: 'print', stickers_printed: 110 },
    ]
    expect(computeStageProgress(logs, 'custom_1', 100)).toEqual({ total: 100, target: 100, percentage: 100, isComplete: true })
    expect(computeStageProgress(logs.slice(0, 1), 'custom_1', 100)).toMatchObject({ total: 58, isComplete: false })
  })

  it('поступило на «Резку» = годные своего этапа', () => {
    const route = getOrderRoute(magnetOrder())
    const logs = [{ stage: 'print', stickers_printed: 110 }, { stage: 'custom_1', qty_done: 105, defects: 5 }]
    expect(computeIncoming(logs, route, 'cutting', 100, null)).toMatchObject({ total: 100, source: 'custom_1' })
    expect(computeIncoming(logs, route, 'custom_1', 100, null)).toMatchObject({ total: 110, source: 'print' })
  })

  it('валидация: отрицательное — ошибка, превышение прихода — предупреждение', () => {
    expect(validateLogEntry('custom_1', { qty_done: -1 })?.severity).toBe('error')
    expect(validateLogEntry('custom_1', { qty_done: 200 }, { incoming: { total: 100 }, progress: { total: 0 } })?.severity).toBe('warning')
    expect(validateLogEntry('custom_1', { qty_done: 50 })).toBeNull()
  })

  it('допечатка на своём этапе: выполнено − брак', () => {
    expect(computeSubtaskStageProgress([{ stage: 'custom_1', qty_done: 12, defects: 2 }], 'custom_1', 10))
      .toMatchObject({ total: 10 })
  })

  it('ТК: свой этап с отметкой «Тип брака на ТК» — в типах брака по маршруту', () => {
    const route = getOrderRoute(magnetOrder())
    expect(otkDefectStagesForRoute(route)).toEqual(['print', 'cutting', 'custom_1'])
    const logs = [
      { stage: 'otk', defect_stage: 'custom_1', defects: 4 },
      { stage: 'otk', defect_stage: 'print', defects: 1 },
    ]
    expect(sumOtkDefectsByStage(logs)).toMatchObject({ print: 1, custom_1: 4, total: 5 })
    // Брак своего этапа вычитается из его строки и всех после него.
    const rows = applyOtkDefects([{ stage: 'print', total: 100 }, { stage: 'custom_1', total: 100 }, { stage: 'cutting', total: 100 }], logs, route)
    expect(rows.map((r) => r.total)).toEqual([99, 95, 95])
    expect(buildOtkReprintComment(sumOtkDefectsByStage(logs))).toBe('Брак ТК: печать 1, термоперенос 4')
    expect(buildOtkLogPayloads([{ defectStage: 'custom_1', qty: 3 }], { allowedStages: otkDefectStagesForRoute(route) }).error).toBeNull()
    expect(fieldValueLabel(STAGE_FIELDS.otk.fields[0], 'custom_1')).toBe('Термоперенос')
  })
})

describe('ставки своего типа (ТЗ 7.6)', () => {
  const rates = resolvePayoutRates()

  it('этап со ставкой: ставка × количество основного поля', () => {
    const order = magnetOrder()
    expect(computeLogPayout({ stage: 'print', stickers_printed: 100 }, order, rates))
      .toEqual([{ category: 'type_rate', stage: 'print', base: 'item', qty: 100, units: 100, rate: 0.5, amount: 50 }])
    expect(computeLogPayout({ stage: 'custom_1', qty_done: 30, defects: 5 }, order, rates)[0])
      .toMatchObject({ qty: 25, amount: 50 })
  })

  it('этап без ставки — без оплаты; правила встроенных (БОПП) не действуют', () => {
    const order = magnetOrder({ bopp_bag: false })
    expect(computeLogPayout({ stage: 'cutting', qty_cut: 100 }, order, rates)).toEqual([])
    // Упаковка своего типа оплачивается по ставке типа даже без БОПП.
    expect(computeLogPayout({ stage: 'packaging', packs_packaged: 10 }, order, rates)[0]).toMatchObject({ amount: 10 })
    // Заливка у своего типа без ставки — без оплаты (ставки формы не действуют).
    expect(computeLogPayout({ stage: 'pouring', stickers_good: 10 }, order, rates)).toEqual([])
    // ТК не оплачивается.
    expect(computeLogPayout({ stage: 'otk', defects: 3 }, order, rates)).toEqual([])
  })

  it('база «за стикер» — только у набора: × стикеров в паке', () => {
    const order = magnetOrder({ order_type: 'type_2', stickers_per_pack: 8, route_snapshot: buildRouteSnapshot(MAGNET_SETS) })
    expect(computeLogPayout({ stage: 'custom_1', qty_done: 10 }, order, rates)[0])
      .toMatchObject({ base: 'sticker', qty: 10, units: 80, amount: 8 })
    // Тот же снимок, но тип не набор → за изделие.
    const notSet = { ...order, route_snapshot: { ...order.route_snapshot, is_set: false } }
    expect(computeLogPayout({ stage: 'custom_1', qty_done: 10 }, notSet, rates)[0]).toMatchObject({ units: 10 })
  })

  it('ставки из снимка заказа: правка ставки в типе прошлую оплату не меняет', () => {
    const order = magnetOrder()
    registerRouteRegistry({ types: [{ ...MAGNETS, rates: { print: { rate: 9, base: 'item' } } }], stages: [THERMO] })
    expect(computeLogPayout({ stage: 'print', stickers_printed: 10 }, order, rates)[0].amount).toBe(5)
  })

  it('встроенный тип со снимком: оплата как без снимка (ветки calculateWorkerPayout)', () => {
    const builtinSnap = { v: 1, type: 'sticker3D', builtin: true, is_set: false, stages: ['print'], production: ['print'], rates: null }
    const logs = [
      { order_id: 'a', stage: 'pouring', stickers_good: 40 },
      { order_id: 'a', stage: 'packaging', packs_packaged: 10 },
      { order_id: 'a', stage: 'print', stickers_printed: 100 },
    ]
    const base = { id: 'a', order_type: 'sticker3D', route_version: 2, stickers_per_pack: 1 }
    const without = calculateWorkerPayout(logs, { ordersById: { a: base } })
    const withSnap = calculateWorkerPayout(logs, { ordersById: { a: { ...base, route_snapshot: builtinSnap } } })
    expect(withSnap).toEqual(without)
    expect(without.breakdown.type_rates).toBeUndefined()
  })

  it('calculateWorkerPayout: строка «Ставки своих типов» в разбивке', () => {
    const order = magnetOrder()
    const logs = [
      { order_id: 'o1', stage: 'print', stickers_printed: 100 },
      { order_id: 'o1', stage: 'custom_1', qty_done: 100, defects: 0 },
    ]
    const p = calculateWorkerPayout(logs, { ordersById: { o1: order } })
    expect(p.total).toBe(250)
    expect(p.breakdown.type_rates).toMatchObject({ count: 200, amount: 250 })
  })
})

describe('приёмка 7.9: тип «Магниты» = Печать → Термоперенос → Резка', () => {
  it('заказ проходит именно эти этапы; у «Термопереноса» есть очередь и право', () => {
    const order = magnetOrder({ status: 'new' })
    const route = getOrderRoute(order)
    expect(route).toEqual([
      'new', 'awaiting_payment', 'design', 'design_approval', 'prepress',
      'print', 'custom_1', 'cutting',
      'packaging', 'otk', 'awaiting_pickup', 'done',
    ])
    // Продвижение по цеху: печать → термоперенос → резка → упаковка.
    const perms = { printer: new Set(['stage:print', 'stage:custom_1', 'stage:cutting']) }
    expect(getNextStatus('printer', 'print', order, perms)).toBe('custom_1')
    expect(getNextStatus('printer', 'custom_1', order, perms)).toBe('cutting')
    expect(getNextStatus('printer', 'cutting', order, perms)).toBe('packaging')
    expect(canAdvanceFrom('post_printer', 'custom_1', { post_printer: new Set() })).toBe(false)
    // Допечатка — с первого этапа производства до упаковки.
    expect(getReprintRoute(order)).toEqual(['print', 'custom_1', 'cutting', 'packaging', 'done'])
    // Очередь и право.
    expect(customQueueConfig('custom_1').status).toBe('custom_1')
    expect(getPermissionList('stages')).toContain('stage:custom_1')
  })

  it('сдельная оплата заказа = ставка типа × количество этапа (кабинет и отчёты — один computeLogPayout)', () => {
    const order = magnetOrder()
    const logs = [
      { order_id: 'o1', stage: 'print', stickers_printed: 120 },
      { order_id: 'o1', stage: 'custom_1', qty_done: 110, defects: 10 },
      { order_id: 'o1', stage: 'cutting', qty_cut: 100 },
      { order_id: 'o1', stage: 'packaging', packs_packaged: 100 },
    ]
    // 120×0.5 + 100×2 + 0 + 100×1
    expect(calculateWorkerPayout(logs, { ordersById: { o1: order } }).total).toBe(360)
    const perLog = logs.reduce((s, l) => s + computeLogPayout(l, order, resolvePayoutRates()).reduce((a, e) => a + e.amount, 0), 0)
    expect(perLog).toBe(360)
  })
})

describe('guard: подписи статусов — только через getStatusMeta', () => {
  function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p)
    }
    return out
  }

  it('в src нет прямого ORDER_STATUSES[x].label / .color (свои этапы не теряют подпись и цвет)', () => {
    const offenders = []
    for (const f of walk(resolve(process.cwd(), 'src'))) {
      if (f.endsWith(join('shared', 'constants.js'))) continue
      const src = readFileSync(f, 'utf-8')
      if (/ORDER_STATUSES\[[^\]]+\]\??\.(label|color)/.test(src)) offenders.push(f)
      if (/=\s*ORDER_STATUSES\[[^\]]+\]\s*$/m.test(src)) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })
})
