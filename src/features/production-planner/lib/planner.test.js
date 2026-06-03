import { describe, it, expect } from 'vitest'
import {
  schedule, getActiveStages, getStageDurationHours, computeOrderVolumes,
  dryingWaitDays,
} from './planner'
import { DEFAULT_NORMS, DEFAULT_CAPACITY } from './norms'

const D = (iso) => new Date(`${iso}T00:00:00.000Z`)
const TODAY = D('2026-06-08') // понедельник

function makeOrder(overrides = {}) {
  return {
    id: 'ord-1',
    order_type: 'sticker_cut',
    status: 'new',
    width_mm: 100,
    height_mm: 100,
    qty: 1000,
    design_variants: 1,
    stickers_per_pack: 1,
    need_lam: true,
    design_status: 'provided',
    film_type: 'G',
    bopp_bag: false,
    priority: 'normal',
    is_urgent: false,
    deadline: '2026-06-30',
    ...overrides,
  }
}

// ============================================================
// computeOrderVolumes / getStageDurationHours
// ============================================================

describe('computeOrderVolumes', () => {
  it('одиночный sticker_cut: pieces = qty', () => {
    const v = computeOrderVolumes(makeOrder({ qty: 500 }), [])
    expect(v.pieces).toBe(500)
    expect(v.fony).toBe(0)
    expect(v.packs).toBe(0)
    expect(v.printMeters).toBeGreaterThan(0)
  })

  it('stickerpack: pieces = qty × stickers_per_pack', () => {
    const v = computeOrderVolumes(
      makeOrder({ order_type: 'stickerpack', qty: 50, stickers_per_pack: 12 }),
      []
    )
    expect(v.pieces).toBe(600)
    expect(v.packs).toBe(50)
  })

  it('stickerpack3D: fony = qty (1 фон на пак)', () => {
    const v = computeOrderVolumes(
      makeOrder({ order_type: 'stickerpack3D', qty: 30, stickers_per_pack: 10 }),
      []
    )
    expect(v.fony).toBe(30)
    expect(v.pieces).toBe(300)
    expect(v.packs).toBe(30)
  })

  it('multi-variant: суммирует pieces по items', () => {
    const order = makeOrder({ qty: 100, width_mm: 50, height_mm: 50 })
    const items = [
      { order_id: 'ord-1', width_mm: 50, height_mm: 50, qty: 100 },
      { order_id: 'ord-1', width_mm: 80, height_mm: 80, qty: 200 },
    ]
    const v = computeOrderVolumes(order, items)
    expect(v.pieces).toBe(300)
    expect(v.kinds).toBe(2)
  })

  it('design_variants ×: умножает pieces', () => {
    const v = computeOrderVolumes(makeOrder({ qty: 100, design_variants: 3 }), [])
    expect(v.pieces).toBe(300)
  })

  it('пустой заказ (без размера) — нули', () => {
    const v = computeOrderVolumes(makeOrder({ qty: 0, width_mm: 0 }), [])
    expect(v.pieces).toBe(0)
    expect(v.printMeters).toBe(0)
  })
})

describe('getStageDurationHours', () => {
  const order = makeOrder({ qty: 1000, width_mm: 50, height_mm: 50, stickers_per_pack: 1 })
  const items = []
  const norms = DEFAULT_NORMS

  it('design = 3 раб. дня × 8 ч = 24 ч (без множителя видов)', () => {
    expect(getStageDurationHours('design', order, items, norms)).toBe(24)
  })

  it('design × kinds, если включён множитель', () => {
    const order2 = makeOrder({ design_variants: 3 })
    expect(getStageDurationHours('design', order2, items, { ...norms, design_multiply_kinds: true })).toBe(72)
  })

  it('sample_layout = verstka_minutes / 60', () => {
    expect(getStageDurationHours('sample_layout', order, items, norms)).toBeCloseTo(10 / 60, 5)
  })

  it('sample_print = 10 мин', () => {
    expect(getStageDurationHours('sample_print', order, items, norms)).toBeCloseTo(10 / 60, 5)
  })

  it('prepress = 30 мин × kinds (по items)', () => {
    const its = [
      { order_id: 'ord-1', width_mm: 50, height_mm: 50, qty: 100 },
      { order_id: 'ord-1', width_mm: 50, height_mm: 50, qty: 100 },
    ]
    expect(getStageDurationHours('prepress', order, its, norms)).toBeCloseTo(60 / 60, 5)
  })

  it('print = (printMeters / 1.5) × 30 / 60', () => {
    const h = getStageDurationHours('print', order, [], norms)
    // qty=1000 шт 50×50 при block_width=1230 → perRow=21, rows=48, meters≈3.84
    expect(h).toBeGreaterThan(0)
    expect(h).toBeLessThan(2)
  })

  it('cutting короче, чем print (15 мин vs 30 мин на блок)', () => {
    const p = getStageDurationHours('print', order, [], norms)
    const c = getStageDurationHours('cutting', order, [], norms)
    expect(c).toBeCloseTo(p / 2, 4)
  })

  it('lamination между print (30мин) и cutting (15мин)', () => {
    const p = getStageDurationHours('print', order, [], norms)
    const l = getStageDurationHours('lamination', order, [], norms)
    expect(l).toBeLessThan(p)
    expect(l).toBeGreaterThan(p / 3)
  })

  it('pouring = pieces / 2184 × 8 ч', () => {
    const o = makeOrder({ order_type: 'sticker3D', qty: 2184 })
    expect(getStageDurationHours('pouring', o, [], norms)).toBeCloseTo(8, 5)
  })

  it('packaging = qty / 800 × 8 ч', () => {
    const o = makeOrder({ order_type: 'stickerpack', qty: 800 })
    expect(getStageDurationHours('packaging', o, [], norms)).toBeCloseTo(8, 5)
  })

  it('otk = 15 мин', () => {
    expect(getStageDurationHours('otk', order, [], norms)).toBeCloseTo(15 / 60, 5)
  })

  it('drying = 0 (пассив)', () => {
    expect(getStageDurationHours('drying', order, [], norms)).toBe(0)
  })

  it('milestone (new/color_approval/done) = 0', () => {
    expect(getStageDurationHours('new', order, [], norms)).toBe(0)
    expect(getStageDurationHours('color_approval', order, [], norms)).toBe(0)
    expect(getStageDurationHours('done', order, [], norms)).toBe(0)
  })

  it('selection_pouring = max(заливка, выборка) для stickerpack3D', () => {
    const o = makeOrder({ order_type: 'stickerpack3D', qty: 1200, stickers_per_pack: 10 })
    const h = getStageDurationHours('selection_pouring', o, [], norms)
    // pieces=12000, fony=1200; resin=12000/2184*8≈43.9; weeding=1200/600*8=16
    expect(h).toBeCloseTo(12000 / 2184 * 8, 3)
  })
})

describe('dryingWaitDays', () => {
  it('36ч → 2 рабочих дня (ТЗ §7.3)', () => {
    expect(dryingWaitDays(DEFAULT_NORMS)).toBe(2)
  })

  it('≤8ч → 1 день', () => {
    expect(dryingWaitDays({ drying_hours: 4 })).toBe(1)
  })

  it('48ч+ → линейный пересчёт', () => {
    expect(dryingWaitDays({ drying_hours: 72 })).toBe(3)
  })
})

// ============================================================
// getActiveStages
// ============================================================

describe('getActiveStages', () => {
  it('new → весь маршрут', () => {
    const stages = getActiveStages(makeOrder({ status: 'new', design_status: 'needs_development' }))
    expect(stages[0]).toBe('new')
    expect(stages).toContain('design')
    expect(stages).toContain('print')
  })

  it('print → срез начиная с print', () => {
    const stages = getActiveStages(makeOrder({ status: 'print' }))
    expect(stages[0]).toBe('print')
    expect(stages).not.toContain('design')
  })

  it('design_status=provided пропускает design', () => {
    const stages = getActiveStages(makeOrder({ status: 'new', design_status: 'provided' }))
    expect(stages).not.toContain('design')
  })

  it('need_lam=false убирает lamination из маршрута', () => {
    const stages = getActiveStages(makeOrder({ status: 'print', need_lam: false }))
    expect(stages).not.toContain('lamination')
  })

  it('done → пустой массив', () => {
    expect(getActiveStages(makeOrder({ status: 'done' }))).toEqual([])
  })

  it('cancelled → пустой массив', () => {
    expect(getActiveStages(makeOrder({ status: 'cancelled' }))).toEqual([])
  })

  it('order без типа → пустой', () => {
    expect(getActiveStages({ id: 'x', status: 'new' })).toEqual([])
  })

  it('грязный статус → планируется весь маршрут', () => {
    const stages = getActiveStages(makeOrder({ status: 'fake_stage' }))
    expect(stages.length).toBeGreaterThan(0)
  })

  it('sticker3D включает pouring + drying + selection', () => {
    const stages = getActiveStages(makeOrder({ order_type: 'sticker3D', status: 'print' }))
    expect(stages).toContain('pouring')
    expect(stages).toContain('drying')
    expect(stages).toContain('selection')
  })
})

// ============================================================
// schedule (главный планировщик)
// ============================================================

describe('schedule', () => {
  function call(orders, opts = {}) {
    return schedule({
      orders,
      items: opts.items || [],
      overrides: opts.overrides || [],
      norms: DEFAULT_NORMS,
      capacity: DEFAULT_CAPACITY,
      holidays: opts.holidays || [],
      today: opts.today || TODAY,
      horizonDays: opts.horizonDays || 30,
    })
  }

  it('пустой ввод — каркас на 30 рабочих дней без задач', () => {
    const r = call([])
    expect(r.days).toHaveLength(30)
    expect(r.orders).toHaveLength(0)
    expect(r.days[0].buckets.design.hours).toBe(0)
    expect(r.days[0].buckets.design.capacity).toBe(8) // 1 дизайнер × 8ч
  })

  it('один маленький заказ — этап печати помещается в один день', () => {
    const r = call([makeOrder({ qty: 100 })])
    const stage = r.byOrder['ord-1'].plannedStages.find((s) => s.stage === 'print')
    expect(stage.days).toHaveLength(1)
    expect(stage.bucket).toBe('oprl_print')
  })

  it('rush заказ планируется первым (raз приоритет = urgent)', () => {
    const a = makeOrder({ id: 'A', deadline: '2026-06-30' })
    const b = makeOrder({ id: 'B', deadline: '2026-06-10', priority: 'urgent' })
    const r = call([a, b])
    // B (rush) занимает день раньше A
    const bStart = r.byOrder['B'].plannedStages.find((s) => s.bucket === 'oprl_print').days[0]
    const aStart = r.byOrder['A'].plannedStages.find((s) => s.bucket === 'oprl_print').days[0]
    expect(bStart <= aStart).toBe(true)
  })

  it('переполнение бакета: остаток переносится на следующий день', () => {
    // Тяжёлый заказ который займёт >8 часов печати
    const heavy = makeOrder({ id: 'H', qty: 100000, width_mm: 100, height_mm: 100 })
    const r = call([heavy])
    const printStage = r.byOrder['H'].plannedStages.find((s) => s.stage === 'print')
    // Должно занять >1 дня
    expect(printStage.days.length).toBeGreaterThan(1)
  })

  it('override закрепляет этап на pinned_date (даже если перегруз)', () => {
    const o = makeOrder({ id: 'O' })
    const overrides = [{ order_id: 'O', stage: 'print', pinned_date: '2026-06-15' }]
    const r = call([o], { overrides })
    const printStage = r.byOrder['O'].plannedStages.find((s) => s.stage === 'print')
    expect(printStage.pinned).toBe(true)
    expect(printStage.days).toEqual(['2026-06-15'])
  })

  it('drying — пассив, рисуется штриховкой, ёмкость не занимает', () => {
    const o = makeOrder({ id: '3D', order_type: 'sticker3D', status: 'pouring' })
    const r = call([o])
    // Найдём день с passive
    const dayWithPassive = r.days.find((d) => d.passives.length > 0)
    expect(dayWithPassive).toBeDefined()
    expect(dayWithPassive.passives[0].order_id).toBe('3D')
    expect(dayWithPassive.passives[0].stage).toBe('drying')
  })

  it('milestone (color_approval) не занимает ёмкость, planned с днями []', () => {
    const o = makeOrder({ id: 'X', status: 'color_approval', design_status: 'needs_development' })
    const r = call([o])
    const ca = r.byOrder['X'].plannedStages.find((s) => s.stage === 'color_approval')
    expect(ca.days).toEqual([])
    expect(ca.hours).toBe(0)
  })

  it('дедлайн на воскресенье отображается на пятницу (previousWorkingDay)', () => {
    const o = makeOrder({ id: 'D', deadline: '2026-06-07' }) // воскресенье
    const r = call([o])
    expect(r.byOrder['D'].deadlineDisplay).toBe('2026-06-05')
  })

  it('заказ не влез в горизонт → late + outOfHorizon', () => {
    // Огромный заказ + малый горизонт
    const o = makeOrder({ id: 'BIG', qty: 1000000, width_mm: 300, height_mm: 300 })
    const r = call([o], { horizonDays: 3 })
    expect(r.byOrder['BIG'].outOfHorizon).toBe(true)
    expect(r.byOrder['BIG'].late).toBe(true)
  })

  it('праздники из holidays пропускаются в каркасе', () => {
    const r = call([], { today: D('2026-06-08'), holidays: ['2026-06-12'] })
    const dates = r.days.map((d) => d.date)
    expect(dates).not.toContain('2026-06-12')
  })

  it('multi-variant: пересчитывает суммарный объём для печати', () => {
    const o = makeOrder({ id: 'MV', qty: 100, width_mm: 50, height_mm: 50 })
    const items = [
      { order_id: 'MV', width_mm: 50, height_mm: 50, qty: 100 },
      { order_id: 'MV', width_mm: 80, height_mm: 80, qty: 500 },
    ]
    const oneVariant = call([o])
    const multi = call([o], { items })
    const oneHours = oneVariant.byOrder['MV'].plannedStages.find((s) => s.stage === 'print').hours
    const multiHours = multi.byOrder['MV'].plannedStages.find((s) => s.stage === 'print').hours
    expect(multiHours).toBeGreaterThan(oneHours)
  })

  it('заказ в done — skipped, не занимает ёмкость', () => {
    const o = makeOrder({ id: 'DONE', status: 'done' })
    const r = call([o])
    expect(r.byOrder['DONE'].skipped).toBe(true)
    expect(r.byOrder['DONE'].plannedStages).toEqual([])
  })

  it('overload помечается на ячейке при pinned-перегрузе', () => {
    // Кладём ОЧЕНЬ длинный этап на конкретный день — превысит дневную ёмкость
    const heavy = makeOrder({ id: 'P', qty: 999999, width_mm: 100, height_mm: 100 })
    const overrides = [{ order_id: 'P', stage: 'print', pinned_date: '2026-06-10' }]
    const r = call([heavy], { overrides })
    const day = r.days.find((d) => d.date === '2026-06-10')
    expect(day.buckets.oprl_print.overload).toBe(true)
  })

  it('finishDay вычисляется как последний день последнего этапа', () => {
    const o = makeOrder({ id: 'F', qty: 100, status: 'otk' })
    const r = call([o])
    // status=otk → только otk (15 мин) → один день старта
    expect(r.byOrder['F'].finishDay).toBe('2026-06-08')
  })

  it('risk = true если finish == deadline', () => {
    const o = makeOrder({ id: 'R', qty: 50, status: 'otk', deadline: '2026-06-08' })
    const r = call([o])
    expect(r.byOrder['R'].risk).toBe(true)
    expect(r.byOrder['R'].late).toBe(false)
  })

  it('late = true если finish > deadline (внутри горизонта)', () => {
    const o = makeOrder({ id: 'L', qty: 50, status: 'otk', deadline: '2026-06-05' })
    const r = call([o])
    expect(r.byOrder['L'].late).toBe(true)
  })

  it('horizon содержит startISO/endISO/length', () => {
    const r = call([])
    expect(r.horizon.length).toBe(30)
    expect(r.horizon.startISO).toBe('2026-06-08')
    expect(r.horizon.endISO).toBeDefined()
  })
})
