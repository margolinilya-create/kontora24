// R25.7A (ТЗ 17.11, Фаза 7): реестр типов заказов + снимок маршрута.
// Главный инвариант части A: для встроенных типов маршрут из снимка заказа,
// из реестра и из констант совпадает при любых флагах заказа — ничего
// видимого не меняется.
import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  ORDER_ROUTES_V2, ORDER_TYPES, ORDER_STATUSES, ROUTE_SUBCONTRACT_V2,
  getOrderRoute, getReprintRoute, getStatusMeta, isStageAllowed, applyV2Rules,
  PERMISSIONS, PERMISSION_LABELS,
} from './constants'
import {
  registerRouteRegistry, resetRouteRegistry, buildTypeStages, buildRouteSnapshot,
  isValidRouteSnapshot, resolveTypeRoute, getTypeDef, BUILTIN_PRODUCTION_STAGES,
  ROUTE_V2_HEAD, ROUTE_V2_TAIL_WITH_PACKAGING,
} from './lib/route-registry'
import { formatOrderType } from './lib/utils'

const read = (f) => readFileSync(resolve(process.cwd(), f), 'utf-8')
const SQL_102 = read('supabase/migrations/102_r25_7_order_types.sql')
const SQL_103 = read('supabase/migrations/103_r25_7_route_snapshot.sql')

/** Разбор сида k24_order_types из миграции 102. */
function parseSeed(sql) {
  const re = /\('(\w+)',\s*'([^']+)',\s*'([^']+)',\s*(true|false),\s*(true|false),\s*'(\[[^']*\])',\s*'(\[[^']*\])',\s*'(\[[^']*\])',\s*(\d+)\)/g
  const rows = []
  let m
  while ((m = re.exec(sql))) {
    rows.push({
      key: m[1],
      name: m[2],
      short_name: m[3],
      is_builtin: m[4] === 'true',
      is_set: m[5] === 'true',
      head: { sample: true, prepress: true },
      production: JSON.parse(m[6]),
      default_production: JSON.parse(m[7]),
      locked_blocks: JSON.parse(m[8]),
      rates: null,
      sort_order: Number(m[9]),
    })
  }
  return rows
}

const SEED = parseSeed(SQL_102)
const BUILTIN_KEYS = Object.keys(ORDER_ROUTES_V2)

const FLAG_SETS = []
for (const design_status of ['needs_development', 'provided', 'needs_edit']) {
  for (const need_lam of [true, false]) {
    for (const needs_montage_film of [false, true]) {
      for (const delivery_type of ['pickup', 'delivery']) {
        for (const is_subcontract of [false, true]) {
          FLAG_SETS.push({ design_status, need_lam, needs_montage_film, delivery_type, is_subcontract })
        }
      }
    }
  }
}

const v2 = (type, flags) => ({ route_version: 2, order_type: type, bopp_bag: false, ...flags })

afterEach(() => resetRouteRegistry())

describe('R25.7A: сид 102 = ORDER_ROUTES_V2', () => {
  it('8 встроенных типов: 7 сегодняшних + «Прочее», ключи совпадают с константами', () => {
    expect(SEED.map((r) => r.key).sort()).toEqual(BUILTIN_KEYS.slice().sort())
    expect(SEED.map((r) => r.key).sort()).toEqual(Object.keys(ORDER_TYPES).sort())
    expect(SEED.every((r) => r.is_builtin)).toBe(true)
  })

  it('названия = подписи ORDER_TYPES, короткие ≤ 16 символов', () => {
    for (const r of SEED) {
      expect(r.name, r.key).toBe(ORDER_TYPES[r.key].label)
      expect(r.short_name.length, r.key).toBeLessThanOrEqual(16)
    }
  })

  it('голова + production + упаковка/хвост = ORDER_ROUTES_V2 для каждого типа', () => {
    for (const r of SEED) {
      expect(buildTypeStages(r), r.key).toEqual(ORDER_ROUTES_V2[r.key])
      expect(r.default_production, r.key).toEqual(r.production)
      expect(r.production, r.key).not.toContain('packaging')
      for (const s of r.production) expect(BUILTIN_PRODUCTION_STAGES, `${r.key}: ${s}`).toContain(s)
    }
  })

  it('набор: stickerpack и stickerpack3D', () => {
    expect(SEED.filter((r) => r.is_set).map((r) => r.key).sort()).toEqual(['stickerpack', 'stickerpack3D'])
  })

  it('замки ТЗ 7.3: печать у всех; заливка→сушка у 3D стикера; выборка→сборка у 3D стикерпака', () => {
    const locks = Object.fromEntries(SEED.map((r) => [r.key, r.locked_blocks]))
    for (const r of SEED) expect(r.locked_blocks[0], r.key).toEqual(['print'])
    expect(locks.sticker3D).toEqual([['print'], ['pouring', 'drying']])
    expect(locks.stickerpack3D).toEqual([['print'], ['selection', 'pouring', 'drying', 'assembly_3d']])
    for (const k of ['sticker_cut', 'sticker_kiss', 'stickerpack', 'rect', 'big', 'other']) {
      expect(locks[k], k).toEqual([['print']])
    }
    // Закреплённые блоки сида выполняются: подряд и по порядку.
    for (const r of SEED) {
      for (const block of r.locked_blocks) {
        const i = r.production.indexOf(block[0])
        expect(i, `${r.key}: ${block}`).toBeGreaterThanOrEqual(0)
        expect(r.production.slice(i, i + block.length), r.key).toEqual(block)
      }
    }
  })

  it('103: ожидаемые массивы самопроверки совпадают с константами', () => {
    const arr = (name) => JSON.parse(SQL_103.match(new RegExp(`${name}\\s+CONSTANT JSONB := '(\\[[^']*\\])'`))[1])
    const head = arr('v_head')
    const tail = arr('v_tail')
    expect([...head]).toEqual(ROUTE_V2_HEAD)
    expect(tail).toEqual(ROUTE_V2_TAIL_WITH_PACKAGING)
    expect([...head, ...arr('v_flat'), ...tail]).toEqual(ORDER_ROUTES_V2.sticker_cut)
    expect([...head, ...arr('v_3d'), ...tail]).toEqual(ORDER_ROUTES_V2.sticker3D)
    expect([...head, ...arr('v_univ'), ...tail]).toEqual(ORDER_ROUTES_V2.stickerpack3D)
    expect(ORDER_ROUTES_V2.other).toEqual(ORDER_ROUTES_V2.stickerpack3D)
  })

  it('103: SQL-сборщик снимка использует ту же голову и хвост', () => {
    expect(SQL_103).toContain(`v_head JSONB := '["new","awaiting_payment","design","design_approval"]'::jsonb`)
    expect(SQL_103).toContain(`'["sample_layout","sample_print","color_approval"]'::jsonb`)
    expect(SQL_103).toContain(`'["prepress"]'::jsonb`)
    expect(SQL_103).toContain(`'["packaging","otk","awaiting_pickup","delivery","done"]'::jsonb`)
  })
})

describe('R25.7A: снимок = реестр = константы для встроенных типов', () => {
  it.each(BUILTIN_KEYS)('%s: getOrderRoute совпадает при всех флагах', (type) => {
    const def = SEED.find((r) => r.key === type)
    const snapshot = { ...buildRouteSnapshot(def, '2026-11-17T00:00:00Z') }
    for (const flags of FLAG_SETS) {
      resetRouteRegistry()
      const fromConstants = getOrderRoute(v2(type, flags))
      const reprintConstants = getReprintRoute(v2(type, flags))
      registerRouteRegistry({ types: SEED })
      const fromRegistry = getOrderRoute(v2(type, flags))
      const reprintRegistry = getReprintRoute(v2(type, flags))
      resetRouteRegistry()
      const fromSnapshot = getOrderRoute(v2(type, { ...flags, route_snapshot: snapshot }))
      const reprintSnapshot = getReprintRoute(v2(type, { ...flags, route_snapshot: snapshot }))
      const label = `${type} ${JSON.stringify(flags)}`
      expect(fromRegistry, label).toEqual(fromConstants)
      expect(fromSnapshot, label).toEqual(fromConstants)
      expect(reprintRegistry, label).toEqual(reprintConstants)
      expect(reprintSnapshot, label).toEqual(reprintConstants)
    }
  })

  it('субподряд игнорирует снимок (ветка ROUTE_SUBCONTRACT_V2)', () => {
    const snapshot = buildRouteSnapshot(SEED.find((r) => r.key === 'sticker3D'))
    const route = getOrderRoute(v2('sticker3D', { is_subcontract: true, delivery_type: 'delivery', route_snapshot: snapshot }))
    expect(route).toEqual(ROUTE_SUBCONTRACT_V2)
    expect(getReprintRoute(v2('sticker3D', { is_subcontract: true, route_snapshot: snapshot }))).toEqual(['done'])
  })

  it('v1 снимок и реестр не читает', () => {
    const custom = { key: 'sticker_cut', production: ['cutting'], head: { sample: false, prepress: false } }
    registerRouteRegistry({ types: [custom] })
    const order = { route_version: 1, order_type: 'sticker_cut', need_lam: true, bopp_bag: true, design_status: 'needs_development', route_snapshot: buildRouteSnapshot(custom) }
    resetRouteRegistry()
    const expected = getOrderRoute(order)
    registerRouteRegistry({ types: [custom] })
    expect(getOrderRoute(order)).toEqual(expected)
    expect(expected).toContain('print')
  })
})

describe('R25.7A: приоритет снимок → реестр → константы', () => {
  const magnets = {
    key: 'type_1', name: 'Магниты', is_builtin: false, is_set: false,
    head: { sample: false, prepress: true },
    production: ['print', 'custom_1', 'cutting'],
    rates: { custom_1: { rate: 2, base: 'item' } },
  }

  it('тип из реестра без снимка: голова без образца + свой этап', () => {
    registerRouteRegistry({ types: [magnets], stages: [{ key: 'custom_1', name: 'Термоперенос', department: 'print', sort_order: 1 }] })
    const order = v2('type_1', { design_status: 'provided', need_lam: false, delivery_type: 'pickup' })
    expect(getOrderRoute(order)).toEqual([
      'new', 'awaiting_payment', 'prepress', 'print', 'custom_1', 'cutting',
      'packaging', 'otk', 'awaiting_pickup', 'done',
    ])
    expect(isStageAllowed(order, 'custom_1')).toBe(true)
    expect(isStageAllowed(order, 'sample_layout')).toBe(false)
    expect(getReprintRoute(order)).toEqual(['print', 'custom_1', 'cutting', 'packaging', 'done'])
  })

  it('снимок заказа важнее текущего реестра (правка типа не трогает заказ)', () => {
    const snapshot = buildRouteSnapshot(magnets)
    registerRouteRegistry({ types: [{ ...magnets, production: ['cutting'] }] })
    const order = v2('type_1', { design_status: 'provided', route_snapshot: snapshot })
    expect(getOrderRoute(order)).toContain('custom_1')
    expect(resolveTypeRoute(order).source).toBe('snapshot')
  })

  it('некорректный снимок → реестр; пустой реестр → константы', () => {
    const order = v2('sticker3D', { route_snapshot: { v: 99, stages: ['new'] }, design_status: 'needs_development' })
    expect(getOrderRoute(order)).toEqual(applyV2Rules(ORDER_ROUTES_V2.sticker3D, order))
    expect(isValidRouteSnapshot({ v: 1, stages: [] })).toBe(false)
    expect(isValidRouteSnapshot({ v: 1, stages: ['new', 'done'] })).toBe(true)
    // Неизвестный тип без реестра — фолбэк sticker_cut (как до R25.7).
    expect(getOrderRoute(v2('type_404', {}))).toEqual(getOrderRoute(v2('sticker_cut', {})))
  })

  it('тип без этапов цеха: допечатка — только упаковка', () => {
    registerRouteRegistry({ types: [{ ...magnets, key: 'ready_made', production: [] }] })
    const order = v2('ready_made', {})
    expect(getOrderRoute(order)).toContain('packaging')
    expect(getReprintRoute(order)).toEqual(['packaging', 'done'])
  })

  it('ставки в снимке только у своих типов', () => {
    expect(buildRouteSnapshot(magnets).rates).toEqual(magnets.rates)
    expect(buildRouteSnapshot({ ...SEED[0], rates: { print: { rate: 1 } } }).rates).toBeNull()
  })
})

describe('R25.7A: подписи из реестра с фолбэком', () => {
  it('formatOrderType: имя из реестра, иначе ORDER_TYPES', () => {
    expect(formatOrderType('sticker3D')).toBe('3D стикер')
    expect(getTypeDef('type_1')).toBeNull()
    expect(formatOrderType('type_1')).toBe('type_1')
    registerRouteRegistry({ types: [{ key: 'type_1', name: 'Магниты', production: [] }] })
    expect(formatOrderType('type_1')).toBe('Магниты')
    expect(formatOrderType({ order_type: 'other', product_name: 'Значки' })).toBe('Значки')
  })

  it('getStatusMeta: встроенный статус из констант, свой этап из каталога', () => {
    expect(getStatusMeta('print')).toBe(ORDER_STATUSES.print)
    expect(getStatusMeta('custom_7')).toBeNull()
    registerRouteRegistry({ stages: [{ key: 'custom_7', name: 'Термоперенос', department: 'print', sort_order: 3 }] })
    const meta = getStatusMeta('custom_7')
    expect(meta.label).toBe('Термоперенос')
    expect(meta.color).toBe(ORDER_STATUSES.print.color)
    expect(meta.order).toBeGreaterThan(ORDER_STATUSES.cancelled.order)
  })

  it('право order_type:manage есть в редакторе прав', () => {
    expect(PERMISSIONS.actions).toContain('order_type:manage')
    expect(PERMISSION_LABELS['order_type:manage']).toBeTruthy()
    expect(SQL_102).toMatch(/'order_type:manage', r\.role = 'admin'/)
  })
})
