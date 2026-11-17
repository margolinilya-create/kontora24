// R25.2 (ТЗ 17.11 Фаза 2) — ТК: брак по типам.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  applyOtkDefects, computeOtkSummary, computeOtkStageProgress, sumOtkDefectsByStage,
  otkDeductionForStage, buildOtkLogPayloads, buildOtkReprintPrefill, buildOtkReprintComment,
  otkTargetQty, OTK_DEFECT_STAGES, STAGE_FIELDS, fieldValueLabel,
} from './production-logs'
import { getOrderRoute, calculateWorkerPayout, computeLogPayout, resolvePayoutRates } from '@/shared/constants'
import { buildQualityRows } from '@/features/reports/lib/quality-report'

const STICKER_CUT = {
  id: 'o1', order_type: 'sticker_cut', qty: 500, need_lam: true, lam_type: 'matte',
  bopp_bag: true, design_status: 'provided', route_version: 1,
}
const ROUTE = getOrderRoute(STICKER_CUT)

// Пример ТЗ 2.3: вырубной стикер, тираж 500, на ТК: печать 10, рез 5.
const EXAMPLE_LOGS = [
  { stage: 'print', stickers_printed: 500 },
  { stage: 'lamination', lamination_qty: 500 },
  { stage: 'cutting', qty_cut: 500 },
  { stage: 'packaging', packs_packaged: 500 },
  { stage: 'otk', defect_stage: 'print', defects: 10 },
  { stage: 'otk', defect_stage: 'cutting', defects: 5 },
]

describe('R25.2: applyOtkDefects — пример ТЗ 2.3', () => {
  it('маршрут вырубного стикера содержит печать → ламинацию → резку → упаковку → ТК', () => {
    const idx = (s) => ROUTE.indexOf(s)
    expect(idx('print')).toBeLessThan(idx('lamination'))
    expect(idx('lamination')).toBeLessThan(idx('cutting'))
    expect(idx('cutting')).toBeLessThan(idx('packaging'))
    expect(idx('packaging')).toBeLessThan(idx('otk'))
  })

  it('500 → 490 / 490 / 485 / 485, годных после ТК 485 / 500', () => {
    const rows = ['print', 'lamination', 'cutting', 'packaging'].map((stage) => ({ stage, total: 500 }))
    const out = applyOtkDefects(rows, EXAMPLE_LOGS, ROUTE)
    expect(out.map((r) => r.total)).toEqual([490, 490, 485, 485])
    expect(out.map((r) => r.otkDefects)).toEqual([10, 10, 15, 15])

    const s = computeOtkSummary(EXAMPLE_LOGS, ROUTE, 500)
    expect(s).toMatchObject({ incoming: 500, defects: 15, good: 485, target: 500, shortage: 15 })
    expect(s.byStage).toMatchObject({ print: 10, lamination: 0, cutting: 5, pouring: 0, total: 15 })
    expect(computeOtkStageProgress(EXAMPLE_LOGS, ROUTE, 500)).toEqual({ total: 485, target: 500, percentage: 97, isComplete: false })
  })

  it('без записей ТК строки не меняются (otkDefects = 0)', () => {
    const rows = [{ stage: 'print', total: 500 }, { stage: 'cutting', total: 480 }]
    const out = applyOtkDefects(rows, EXAMPLE_LOGS.slice(0, 4), ROUTE)
    expect(out).toEqual([{ stage: 'print', total: 500, otkDefects: 0 }, { stage: 'cutting', total: 480, otkDefects: 0 }])
  })

  it('этапы до типа брака не затрагиваются (prepress, ламинация при браке реза)', () => {
    const logs = [{ stage: 'otk', defect_stage: 'cutting', defects: 7 }]
    const out = applyOtkDefects(
      [{ stage: 'prepress', total: 1 }, { stage: 'lamination', total: 100 }, { stage: 'cutting', total: 100 }],
      logs, ROUTE,
    )
    expect(out.map((r) => r.total)).toEqual([1, 100, 93])
  })

  it('удалённые записи ТК, нулевой брак и чужие типы не учитываются', () => {
    const logs = [
      { stage: 'otk', defect_stage: 'print', defects: 10, deleted_at: '2026-11-17T10:00:00Z' },
      { stage: 'otk', defect_stage: 'print', defects: 0 },
      { stage: 'otk', defect_stage: 'packaging', defects: 3 },
      { stage: 'cutting', defects: 4 },
    ]
    expect(sumOtkDefectsByStage(logs).total).toBe(0)
  })

  it('тип брака, чьего этапа нет в маршруте, на строки не влияет', () => {
    const byStage = { print: 0, lamination: 6, cutting: 0, pouring: 0 }
    const noLam = getOrderRoute({ ...STICKER_CUT, need_lam: false })
    expect(otkDeductionForStage(byStage, noLam, 'packaging')).toBe(0)
    expect(otkDeductionForStage(byStage, ROUTE, 'packaging')).toBe(6)
  })

  it('total не уходит ниже нуля, кроме allowNegative-строк (сушка)', () => {
    const logs = [{ stage: 'otk', defect_stage: 'print', defects: 50 }]
    const out = applyOtkDefects([{ stage: 'cutting', total: 20 }, { stage: 'packaging', total: 20, allowNegative: true }], logs, ROUTE)
    expect(out.map((r) => r.total)).toEqual([0, -30])
  })
})

describe('R25.2: 3D-стикерпак — паки вычитаются 1:1 из строк в стикерах', () => {
  const PACK = { order_type: 'stickerpack3D', qty: 100, stickers_per_pack: 8, need_lam: false, design_status: 'provided', route_version: 1 }
  const route = getOrderRoute(PACK)

  it('брак заливки 3 пака: −3 на заливке, сушке, сборке, упаковке; печать не трогается', () => {
    const logs = [{ stage: 'otk', defect_stage: 'pouring', defects: 3 }]
    const rows = [
      { stage: 'print', total: 800 }, { stage: 'pouring', total: 800 },
      { stage: 'drying', total: 800, allowNegative: true }, { stage: 'assembly_3d', total: 100 },
      { stage: 'packaging', total: 100 },
    ]
    expect(applyOtkDefects(rows, logs, route).map((r) => r.total)).toEqual([800, 797, 797, 97, 97])
  })
})

describe('R25.2: мульти-вид — вычет по item_idx', () => {
  it('поэвидовая строка берёт только свой вид, order-level с excludeItemLogs — только записи без вида', () => {
    const logs = [
      { stage: 'otk', defect_stage: 'print', defects: 4, item_idx: 1 },
      { stage: 'otk', defect_stage: 'print', defects: 6, item_idx: 2 },
      { stage: 'otk', defect_stage: 'print', defects: 1, item_idx: null },
    ]
    const out = applyOtkDefects([
      { stage: 'print', total: 100, itemIdx: 1 },
      { stage: 'print', total: 100, itemIdx: 2 },
      { stage: 'print', total: 100, excludeItemLogs: true },
      { stage: 'print', total: 300 },
    ], logs, ROUTE)
    expect(out.map((r) => r.total)).toEqual([96, 94, 99, 289])
  })

  it('тираж ТК у мульти-вида — сумма видов, у 3D-пака и одного вида — qty', () => {
    expect(otkTargetQty({ order_type: 'sticker_cut', qty: 100 }, [{ qty: 100 }, { qty: 50 }])).toBe(150)
    expect(otkTargetQty({ order_type: 'sticker_cut', qty: 100 }, [{ qty: 100 }])).toBe(100)
    expect(otkTargetQty({ order_type: 'stickerpack3D', qty: 20 }, [{ qty: 20 }, { qty: 5 }])).toBe(20)
  })
})

describe('R25.2: computeOtkSummary без учёта до ТК', () => {
  it('нет количественных записей → поступило неизвестно, недостачу не показываем', () => {
    const s = computeOtkSummary([{ stage: 'otk', defect_stage: 'print', defects: 2 }], ROUTE, 500)
    expect(s).toMatchObject({ incoming: null, good: null, defects: 2, shortage: 0 })
  })

  it('логи допечатки (subtask_id) входят в «поступило»', () => {
    const logs = [
      { stage: 'packaging', packs_packaged: 490 },
      { stage: 'packaging', packs_packaged: 10, subtask_id: 's1' },
      { stage: 'otk', defect_stage: 'print', defects: 5 },
    ]
    expect(computeOtkSummary(logs, ROUTE, 500)).toMatchObject({ incoming: 500, good: 495, shortage: 5 })
  })
})

describe('R25.2: форма ТК → записи логов', () => {
  it('строки превращаются в записи defect_stage / defects / item_idx / track', () => {
    const { payloads, error } = buildOtkLogPayloads([
      { defectStage: 'print', qty: '10', view: '' },
      { defectStage: '', qty: '', view: '' },
      { defectStage: 'cutting', qty: 5, view: '' },
    ])
    expect(error).toBeNull()
    expect(payloads).toEqual([
      { defect_stage: 'print', defects: 10, item_idx: null, track: null },
      { defect_stage: 'cutting', defects: 5, item_idx: null, track: null },
    ])
  })

  it('валидация: тип из маршрута, целое ≥ 1, вид обязателен при нескольких видах', () => {
    expect(buildOtkLogPayloads([]).error).toBeTruthy()
    expect(buildOtkLogPayloads([{ defectStage: 'pouring', qty: 1 }], { allowedStages: ['print', 'cutting'] }).error).toBe('Выберите тип брака')
    expect(buildOtkLogPayloads([{ defectStage: 'print', qty: 0 }]).error).toBe('Количество — целое число от 1')
    expect(buildOtkLogPayloads([{ defectStage: 'print', qty: '2.5' }]).error).toBe('Количество — целое число от 1')
    expect(buildOtkLogPayloads([{ defectStage: 'print', qty: 3, view: '' }], { viewRequired: true }).error).toBe('Выберите вид')
    expect(buildOtkLogPayloads([{ defectStage: 'print', qty: 3, view: '2' }], { viewRequired: true }).payloads[0].item_idx).toBe(2)
  })

  it('со склада ничего не списывается: записи ТК не несут полей, по которым работает deduct_materials_from_log', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/096_r25_8_warehouse_journal.sql'), 'utf-8')
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.deduct_materials_from_log()')
    const body = sql.slice(start, sql.indexOf('$function$;', start))
    expect(start).toBeGreaterThan(0)
    // Списание идёт только по дельтам этих колонок NEW/OLD.
    const used = new Set([...body.matchAll(/\b(?:NEW|OLD)\.([a-z_]+)/g)].map((m) => m[1]))
    const DEDUCT_FIELDS = ['film_meters', 'lamination_meters', 'resin_grams', 'packs_packaged', 'boxes_used']
    for (const f of DEDUCT_FIELDS) expect(used.has(f)).toBe(true)
    const { payloads } = buildOtkLogPayloads(
      OTK_DEFECT_STAGES.map((x, i) => ({ defectStage: x, qty: i + 1, view: '1' })),
      { viewRequired: true },
    )
    for (const p of payloads) {
      for (const f of DEDUCT_FIELDS) expect(p).not.toHaveProperty(f)
      expect(Object.keys(p).sort()).toEqual(['defect_stage', 'defects', 'item_idx', 'track'])
    }
  })

  it('STAGE_FIELDS.otk: тип брака — список с подписями', () => {
    const f = STAGE_FIELDS.otk.fields.find((x) => x.key === 'defect_stage')
    expect(f.options.map((o) => o.value)).toEqual(OTK_DEFECT_STAGES)
    expect(fieldValueLabel(f, 'cutting')).toBe('Рез')
    expect(fieldValueLabel({ key: 'defects' }, 5)).toBe(5)
  })
})

describe('R25.2: допечатка из недостачи', () => {
  it('комментарий «Брак ТК: печать 10, рез 5», количество = недостача, причина «Брак»', () => {
    const s = computeOtkSummary(EXAMPLE_LOGS, ROUTE, 500)
    expect(buildOtkReprintComment(s.byStage)).toBe('Брак ТК: печать 10, рез 5')
    expect(buildOtkReprintPrefill(EXAMPLE_LOGS, s)).toEqual({ qty: 15, reason: 'defect', view: null, comment: 'Брак ТК: печать 10, рез 5' })
  })

  it('весь брак по одному виду → вид предзаполнен; по разным — нет', () => {
    const one = [{ stage: 'otk', defect_stage: 'print', defects: 3, item_idx: 2 }, { stage: 'otk', defect_stage: 'cutting', defects: 1, item_idx: 2 }]
    expect(buildOtkReprintPrefill(one, { shortage: 4, byStage: {} }).view).toBe(2)
    const two = [...one, { stage: 'otk', defect_stage: 'print', defects: 1, item_idx: 1 }]
    expect(buildOtkReprintPrefill(two, { shortage: 5, byStage: {} }).view).toBeNull()
  })
})

describe('R25.2: сдельная оплата не меняется от брака ТК (ТЗ 2.5)', () => {
  const PACK = { order_type: 'stickerpack3D', stickers_per_pack: 8, bopp_bag: true, route_version: 1 }
  const WORK = [
    { worker_id: 'w1', stage: 'pouring', order_id: 'o1', stickers_good: 120, order: PACK },
    { worker_id: 'w2', stage: 'assembly_3d', order_id: 'o1', packs_assembled: 12, order: PACK },
    { worker_id: 'w1', stage: 'packaging', order_id: 'o1', packs_packaged: 50, order: PACK },
    { worker_id: 'w2', stage: 'selection', order_id: 'o1', qty_selected: 25, order: PACK },
  ]
  const OTK = OTK_DEFECT_STAGES.map((x) => ({ worker_id: 'w1', stage: 'otk', order_id: 'o1', defect_stage: x, defects: 7, order: PACK }))

  it('итог и разбивка calculateWorkerPayout совпадают до и после записей ТК', () => {
    expect(calculateWorkerPayout([...WORK, ...OTK])).toEqual(calculateWorkerPayout(WORK))
  })

  it('computeLogPayout игнорирует stage=otk даже с «оплачиваемыми» полями', () => {
    const rates = resolvePayoutRates()
    const weird = { stage: 'otk', defect_stage: 'pouring', defects: 3, stickers_good: 10, packs_packaged: 5, packs_assembled: 2, qty_selected: 4 }
    expect(computeLogPayout(weird, PACK, rates)).toEqual([])
  })
})

describe('R25.2: отчёт «Качество»', () => {
  const ORDERS = [{ id: 'o1', number: 1, qty: 500, order_type: 'sticker3D' }, { id: 'o2', number: 2, qty: 100, order_type: 'sticker_cut' }]
  const BASE = [
    { order_id: 'o1', stage: 'print', stickers_printed: 520, defects: 2 },
    { order_id: 'o1', stage: 'pouring', stickers_poured: 510, stickers_good: 500, defects: 0 },
    { order_id: 'o2', stage: 'cutting', defects: 3 },
  ]

  it('без записей ТК базовые колонки — как до R25.2', () => {
    const rows = buildQualityRows(ORDERS, BASE)
    expect(rows[0]).toMatchObject({ printed: 520, poured: 510, good: 500, rejected: 10, rejectPct: 2, surplus: 20, surplusPct: 4, otk_total: 0 })
    expect(rows[0]).toMatchObject({ defects_print: 2, defects_cutting: 0 })
    expect(rows[1]).toMatchObject({ printed: 0, poured: 0, rejected: 0, rejectPct: 0, surplus: 0, defects_cutting: 3 })
  })

  it('брак ТК добавляется к браку этапа своего типа + «в т.ч. найдено на ТК»', () => {
    const rows = buildQualityRows(ORDERS, [
      ...BASE,
      { order_id: 'o1', stage: 'otk', defect_stage: 'pouring', defects: 4 },
      { order_id: 'o1', stage: 'otk', defect_stage: 'print', defects: 1 },
      { order_id: 'o2', stage: 'otk', defect_stage: 'cutting', defects: 2 },
    ])
    expect(rows[0]).toMatchObject({ rejected: 14, otk_pouring: 4, defects_print: 3, otk_print: 1, otk_total: 5 })
    expect(rows[1]).toMatchObject({ defects_cutting: 5, otk_cutting: 2, otk_total: 2 })
  })
})
