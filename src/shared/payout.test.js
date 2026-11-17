// R25.0: единая сдельная оплата (computeLogPayout). Тесты фиксируют текущие
// выходы calculateWorkerPayout и отчётов «Сдельная оплата» / «Сотрудники» и
// сверяют их с копией логики ДО рефакторинга (legacy*) на репрезентативных логах.
import { describe, it, expect } from 'vitest'
import {
  computeLogPayout, calculateWorkerPayout, resolvePayoutRates, settingsToRates, WORKER_RATES,
} from './constants'
import { shapeForLog } from './lib/payout-context'
import { buildBonusRows, logPayoutTotals } from '@/features/reports/lib/payout-report'

// Прод-настройки bonus_rates (k24_settings, снято 2026-11-17).
const PROD_SETTINGS = {
  pouring: 1, packaging: 1.5, selection: 0.5, assembly_3d: 0.5,
  pouring_shapes: { big: 1.5, complex: 1.5, standard: 1, complex_big: 2 },
}

const PACK = { order_type: 'stickerpack3D', stickers_per_pack: 8, sticker_shape: 'standard' }
const PACK_NO_SPP = { order_type: 'stickerpack3D', stickers_per_pack: null, sticker_shape: 'standard' }
const S3D = { order_type: 'sticker3D', stickers_per_pack: null, sticker_shape: 'big' }

const W1 = { display_name: 'Аня' }
const W2 = { display_name: 'Боря' }

const LOGS = [
  { worker_id: 'w1', worker: W1, stage: 'pouring', order_id: 'o1', design_index: 1, stickers_good: 120, order: PACK, created_at: '2026-06-01T10:00:00Z' },
  { worker_id: 'w1', worker: W1, stage: 'pouring', order_id: 'o1', design_index: 2, stickers_good: 40, order: PACK, created_at: '2026-06-01T11:00:00Z' },
  { worker_id: 'w1', worker: W1, stage: 'pouring', order_id: 'o2', design_index: null, stickers_good: 30, order: S3D, created_at: '2026-06-02T10:00:00Z' },
  { worker_id: 'w1', worker: W1, stage: 'selection_pouring', order_id: 'o1', design_index: 3, stickers_good: 10, qty_selected: 5, order: PACK, created_at: '2026-06-02T12:00:00Z' },
  { worker_id: 'w2', worker: W2, stage: 'selection', order_id: 'o1', qty_selected: 25, order: PACK, created_at: '2026-06-03T09:00:00Z' },
  { worker_id: 'w2', worker: W2, stage: 'selection', order_id: 'o2', qty_selected: 25, order: S3D, created_at: '2026-06-03T10:00:00Z' },
  { worker_id: 'w2', worker: W2, stage: 'selection', order_id: 'o3', qty_selected: 4, order: PACK_NO_SPP, created_at: '2026-06-03T11:00:00Z' },
  { worker_id: 'w2', worker: W2, stage: 'assembly_3d', order_id: 'o1', packs_assembled: 12, order: PACK, created_at: '2026-06-04T09:00:00Z' },
  { worker_id: 'w2', worker: W2, stage: 'assembly_3d', order_id: 'o3', packs_assembled: 3, order: PACK_NO_SPP, created_at: '2026-06-04T10:00:00Z' },
  { worker_id: 'w1', worker: W1, stage: 'packaging', order_id: 'o1', packs_packaged: 50, order: PACK, created_at: '2026-06-05T09:00:00Z' },
  { worker_id: 'w1', worker: W1, stage: 'packaging', order_id: 'o2', packs_packaged: 7, order: S3D, created_at: '2026-06-05T10:00:00Z' },
  // Неоплачиваемые этапы.
  { worker_id: 'w2', worker: W2, stage: 'print', order_id: 'o1', stickers_printed: 500, order: PACK, created_at: '2026-06-01T08:00:00Z' },
  { worker_id: 'w2', worker: W2, stage: 'drying', order_id: 'o1', defects: 4, order: PACK, created_at: '2026-06-06T08:00:00Z' },
  { worker_id: 'w1', worker: W1, stage: 'pouring', order_id: 'o1', design_index: 1, stickers_good: 0, order: PACK, created_at: '2026-06-06T09:00:00Z' },
]

const SHAPE_BY_DESIGN = { 'o1:2': 'complex', 'o1:3': 'complex_big' }
const ORDER_SHAPE = { o2: 'big' }
const shapeOf = (l) => shapeForLog(l, SHAPE_BY_DESIGN, ORDER_SHAPE)

// ── Копия логики до R25.0 (useReports.js useBonusReport/useEmployeeReport) ──
function legacyPouringRate(shape, bonusRates) {
  const byShape = bonusRates?.pouring_shapes
  if (byShape && byShape[shape] != null) return Number(byShape[shape])
  return Number(bonusRates?.pouring) || 0
}
function legacyLogPay(l, rates) {
  const t = { poured: 0, selected: 0, assembled: 0, packaged: 0, payout: 0 }
  const perPack = Number(l.order?.stickers_per_pack) || 1
  if (l.stickers_good) { t.poured += l.stickers_good; t.payout += l.stickers_good * legacyPouringRate(shapeOf(l), rates) }
  if (l.packs_assembled) { t.assembled += l.packs_assembled; t.payout += l.packs_assembled * perPack * (rates.assembly_3d || 0) }
  if (l.packs_packaged) { t.packaged += l.packs_packaged; t.payout += l.packs_packaged * (rates.packaging || 0) }
  if (l.qty_selected) {
    const isBg = l.stage === 'selection_pouring' || (l.stage === 'selection' && l.order?.order_type === 'stickerpack3D')
    t.selected += l.qty_selected; t.payout += l.qty_selected * (isBg ? perPack : 1) * (rates.selection || 0)
  }
  return t
}

describe('computeLogPayout', () => {
  const rates = resolvePayoutRates(settingsToRates(PROD_SETTINGS))

  it('заливка: stickers_good × ставка формы', () => {
    expect(computeLogPayout({ stage: 'pouring', stickers_good: 10 }, PACK, rates, { shape: 'complex_big' }))
      .toEqual([{ category: 'pouring_complex_big', shape: 'complex_big', qty: 10, units: 10, rate: 2, amount: 20 }])
    expect(computeLogPayout({ stage: 'pouring', stickers_good: 10 }, PACK, rates))
      .toEqual([{ category: 'pouring_standard', shape: 'standard', qty: 10, units: 10, rate: 1, amount: 10 }])
  })

  it('selection_pouring: заливка + выборка фонов × stickers_per_pack', () => {
    expect(computeLogPayout({ stage: 'selection_pouring', stickers_good: 10, qty_selected: 5 }, PACK, rates, { shape: 'big' })).toEqual([
      { category: 'pouring_big', shape: 'big', qty: 10, units: 10, rate: 1.5, amount: 15 },
      { category: 'selection', qty: 5, units: 40, rate: 0.5, amount: 20 },
    ])
  })

  it('selection: stickerpack3D ×spp, sticker3D ×1', () => {
    expect(computeLogPayout({ stage: 'selection', qty_selected: 25 }, PACK, rates)[0]).toMatchObject({ qty: 25, units: 200, amount: 100 })
    expect(computeLogPayout({ stage: 'selection', qty_selected: 25 }, S3D, rates)[0]).toMatchObject({ qty: 25, units: 25, amount: 12.5 })
    expect(computeLogPayout({ stage: 'selection', qty_selected: 4 }, PACK_NO_SPP, rates)[0]).toMatchObject({ units: 4, amount: 2 })
  })

  it('сборка 3D: packs × stickers_per_pack × 0.5', () => {
    expect(computeLogPayout({ stage: 'assembly_3d', packs_assembled: 12 }, PACK, rates))
      .toEqual([{ category: 'assembly', qty: 12, units: 96, rate: 0.5, amount: 48 }])
    expect(computeLogPayout({ stage: 'assembly_3d', packs_assembled: 3 }, null, rates)[0].amount).toBe(1.5)
  })

  it('упаковка: packs_packaged × 1.5', () => {
    expect(computeLogPayout({ stage: 'packaging', packs_packaged: 7 }, S3D, rates))
      .toEqual([{ category: 'packaging', qty: 7, units: 7, rate: 1.5, amount: 10.5 }])
  })

  it('поле оплачивается только на своём этапе', () => {
    expect(computeLogPayout({ stage: 'drying', packs_packaged: 5, stickers_good: 5, qty_selected: 5, packs_assembled: 5 }, PACK, rates)).toEqual([])
    expect(computeLogPayout({ stage: 'print', stickers_printed: 100 }, PACK, rates)).toEqual([])
    expect(computeLogPayout({ stage: 'pouring', stickers_good: 0 }, PACK, rates)).toEqual([])
    expect(computeLogPayout(null, PACK, rates)).toEqual([])
  })

  it('неизвестная форма → стандартная', () => {
    expect(computeLogPayout({ stage: 'pouring', stickers_good: 4 }, S3D, rates, { shape: 'weird' })[0])
      .toMatchObject({ category: 'pouring_standard', amount: 4 })
  })

  it('resolvePayoutRates: дефолты WORKER_RATES + частичная карта форм', () => {
    const r = resolvePayoutRates({ pouring_by_shape: { complex: 3 } })
    expect(r.pouring_by_shape).toEqual({ ...WORKER_RATES.pouring_by_shape, complex: 3 })
    expect(r.packaging_per_pack).toBe(1.5)
    expect(resolvePayoutRates(undefined)).toEqual(WORKER_RATES)
  })
})

describe('calculateWorkerPayout (R25.0 — пин на эталонных логах)', () => {
  const opts = { rates: settingsToRates(PROD_SETTINGS), shapeByDesign: SHAPE_BY_DESIGN, orderShape: ORDER_SHAPE }

  it('итог и разбивка не изменились', () => {
    const r = calculateWorkerPayout(LOGS, opts)
    // pouring: std 120 ×1 + complex 40 ×1.5 + big 30 ×1.5 + complex_big 10 ×2 = 120+60+45+20
    expect(r.breakdown.pouring_standard).toMatchObject({ count: 120, amount: 120 })
    expect(r.breakdown.pouring_complex).toMatchObject({ count: 40, amount: 60 })
    expect(r.breakdown.pouring_big).toMatchObject({ count: 30, amount: 45 })
    expect(r.breakdown.pouring_complex_big).toMatchObject({ count: 10, amount: 20 })
    // selection: 5×8 + 25×8 + 25×1 + 4×1 = 269 стикеров; фоны 59
    expect(r.breakdown.selection).toMatchObject({ count: 269, bgs: 59, amount: 134.5 })
    // assembly: 12×8 + 3×1 = 99 стикеров
    expect(r.breakdown.assembly).toMatchObject({ count: 99, packs: 15, amount: 49.5 })
    expect(r.breakdown.packaging).toMatchObject({ count: 57, amount: 85.5 })
    expect(r.total).toBe(514.5)
  })

  it('ordersById приоритетнее embed order', () => {
    const logs = [{ stage: 'assembly_3d', order_id: 'x', packs_assembled: 2, order: { stickers_per_pack: 1 } }]
    expect(calculateWorkerPayout(logs, { ordersById: { x: { stickers_per_pack: 10 } } }).total).toBe(10)
  })
})

describe('отчёты «Сдельная оплата» / «Сотрудники» = legacy на эталонных логах', () => {
  const rates = resolvePayoutRates(settingsToRates(PROD_SETTINGS))

  it('logPayoutTotals совпадает с логикой до R25.0 на каждом логе', () => {
    for (const l of LOGS) expect(logPayoutTotals(l, rates, shapeOf(l))).toEqual(legacyLogPay(l, PROD_SETTINGS))
  })

  it('buildBonusRows: пин сумм по сотрудникам', () => {
    const rows = buildBonusRows(LOGS, rates, shapeOf)
    expect(rows).toEqual([
      // Аня: 120 + 60 + 45 + 20 (заливка) + 20 (выборка 5×8) + 85.5 (упаковка)
      { name: 'Аня', resin: 200, selection: 5, assembly: 0, packaging: 57, total: 350.5 },
      // Боря: выборка 100 + 12.5 + 2, сборка 48 + 1.5
      { name: 'Боря', resin: 0, selection: 54, assembly: 15, packaging: 0, total: 164 },
    ])
    // Сумма отчёта = calculateWorkerPayout (кабинет / Unit Economics).
    const total = rows.reduce((s, r) => s + r.total, 0)
    expect(total).toBe(calculateWorkerPayout(LOGS, {
      rates: settingsToRates(PROD_SETTINGS), shapeByDesign: SHAPE_BY_DESIGN, orderShape: ORDER_SHAPE,
    }).total)
  })

  it('без строки bonus_rates — дефолты WORKER_RATES (как прежний фолбэк)', () => {
    const fallback = { pouring: 1, assembly_3d: 0.5, packaging: 1.5, selection: 0.5, pouring_shapes: WORKER_RATES.pouring_by_shape }
    const r = resolvePayoutRates(settingsToRates(undefined))
    for (const l of LOGS) expect(logPayoutTotals(l, r, shapeOf(l))).toEqual(legacyLogPay(l, fallback))
  })
})
