import { describe, it, expect } from 'vitest'
import {
  withRecomputedGood, queueStageTarget, computeQueueStageProgress, computeIncoming,
} from './production-logs'

// Ревью 17.11 — фиксы зоны production.

describe('withRecomputedGood (правка лога заливки)', () => {
  it('pouring: новое «Залито» пересчитывает stickers_good', () => {
    const log = { stage: 'pouring', stickers_poured: 100, stickers_good: 100, defects: null }
    expect(withRecomputedGood(log, { stickers_poured: 120, resin_grams: 5 }))
      .toEqual({ stickers_poured: 120, resin_grams: 5, stickers_good: 120 })
  })

  it('легаси-брак лога вычитается: good = max(0, залито − брак)', () => {
    const log = { stage: 'pouring', stickers_poured: 100, stickers_good: 90, defects: 10 }
    expect(withRecomputedGood(log, { stickers_poured: 80 }).stickers_good).toBe(70)
    expect(withRecomputedGood(log, { stickers_poured: 5 }).stickers_good).toBe(0)
  })

  it('без изменения «Залито»/брака патч не трогаем (легаси stickers_good вручную)', () => {
    const legacy = { stage: 'pouring', stickers_poured: null, stickers_good: 50, defects: null }
    const patch = { stickers_poured: null, resin_grams: 3 }
    expect(withRecomputedGood(legacy, patch)).toBe(patch)
    const same = { stage: 'pouring', stickers_poured: 40, stickers_good: 40 }
    expect(withRecomputedGood(same, { stickers_poured: 40 })).not.toHaveProperty('stickers_good')
  })

  it('стёртое «Залито» обнуляет годных', () => {
    const log = { stage: 'pouring', stickers_poured: 40, stickers_good: 40 }
    expect(withRecomputedGood(log, { stickers_poured: null }).stickers_good).toBeNull()
  })

  it('selection_pouring (трек стикеров) — то же; фоны без stickers_poured не трогаем', () => {
    const stk = { stage: 'selection_pouring', track: 'stickers', stickers_poured: 30, stickers_good: 30 }
    expect(withRecomputedGood(stk, { qty_selected: null, stickers_poured: 35 }).stickers_good).toBe(35)
    const bg = { stage: 'selection_pouring', track: 'backgrounds', qty_selected: 10 }
    const patch = { qty_selected: 12, stickers_poured: null }
    expect(withRecomputedGood(bg, patch)).toBe(patch)
  })

  it('другие этапы не трогаем', () => {
    const patch = { qty_cut: 5 }
    expect(withRecomputedGood({ stage: 'cutting', qty_cut: 3 }, patch)).toBe(patch)
  })
})

describe('queueStageTarget / computeQueueStageProgress (карточка очереди)', () => {
  const pack = { order_type: 'stickerpack3D', qty: 10, stickers_per_pack: 12 }

  it('stickerpack3D на заливке и сушке — цель в стикерах', () => {
    expect(queueStageTarget(pack, 'pouring')).toBe(120)
    expect(queueStageTarget(pack, 'drying')).toBe(120)
    expect(queueStageTarget(pack, 'cutting')).toBe(10)
    expect(queueStageTarget({ order_type: 'sticker3D', qty: 50 }, 'pouring')).toBe(50)
  })

  it('заливка stickerpack3D: 60 из 120 = 50%', () => {
    const logs = [{ stage: 'pouring', stickers_good: 60 }]
    const p = computeQueueStageProgress(logs, pack, 'pouring')
    expect(p).toMatchObject({ total: 60, target: 120, percentage: 50, isComplete: false })
  })

  it('сушка: годных = залитые − брак сушки', () => {
    const logs = [
      { stage: 'pouring', stickers_good: 120 },
      { stage: 'drying', defects: 6 },
    ]
    const p = computeQueueStageProgress(logs, pack, 'drying')
    expect(p).toMatchObject({ total: 114, target: 120, percentage: 95, isComplete: false })
  })

  it('прочие этапы — как computeStageProgress от тиража', () => {
    const logs = [{ stage: 'print', stickers_printed: 8, defects: 1 }]
    expect(computeQueueStageProgress(logs, pack, 'print')).toMatchObject({ total: 7, target: 10 })
  })
})

describe('computeIncoming: сушка и нетто-заливка', () => {
  const ROUTE_3D = ['new', 'prepress', 'print', 'cutting', 'pouring', 'drying', 'selection', 'packaging', 'otk', 'done']

  it('после сушки брак сушки вычитается из залитых', () => {
    const logs = [
      { stage: 'pouring', stickers_poured: 100, stickers_good: 100 },
      { stage: 'drying', defects: 7 },
    ]
    const r = computeIncoming(logs, ROUTE_3D, 'selection', 100, null)
    expect(r).toMatchObject({ total: 93, source: 'pouring', produced: 100, defects: 7 })
  })

  it('stickers_good уже нетто — брак заливки повторно не вычитаем', () => {
    const logs = [{ stage: 'pouring', stickers_poured: 100, stickers_good: 90, defects: 10 }]
    expect(computeIncoming(logs, ROUTE_3D, 'drying', 100, null).total).toBe(90)
  })

  it('лог заливки без stickers_good: его брак вычитается как раньше', () => {
    const logs = [
      { stage: 'pouring', stickers_good: 50 },
      { stage: 'pouring', stickers_good: null, defects: 4 },
    ]
    expect(computeIncoming(logs, ROUTE_3D, 'drying', 100, null).total).toBe(46)
  })

  it('без заливки брак сушки уходит в ближайший количественный этап', () => {
    const logs = [{ stage: 'drying', defects: 3 }, { stage: 'cutting', qty_cut: 20, defects: 2 }]
    const r = computeIncoming(logs, ROUTE_3D, 'selection', 20, null)
    expect(r).toMatchObject({ source: 'cutting', total: 15 })
  })
})
