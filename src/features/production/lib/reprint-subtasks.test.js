import { describe, it, expect } from 'vitest'
import { getReprintRoute } from '@/shared/constants'
import {
  computeSubtaskStageProgress,
  computeSubtaskOverallProgress,
  reprintUiStatus,
  reprintStageFields,
} from './production-logs'

// R22.1 (ТЗ 20.07 Фаза 1) — подзадачи-допечатки.

describe('getReprintRoute', () => {
  it('sticker_cut: печать → ламинация → резка → упаковка → done (без otk)', () => {
    const r = getReprintRoute({ order_type: 'sticker_cut', need_lam: true, bopp_bag: true })
    expect(r[0]).toBe('print')
    expect(r).toContain('lamination')
    expect(r).toContain('packaging')
    expect(r).not.toContain('otk')
    expect(r[r.length - 1]).toBe('done')
  })

  it('sticker_cut без ламинации — этап lamination пропущен', () => {
    const r = getReprintRoute({ order_type: 'sticker_cut', need_lam: false, bopp_bag: true })
    expect(r).not.toContain('lamination')
    expect(r[0]).toBe('print')
  })

  it('sticker3D: сохраняет заливку/сушку/выборку из маршрута заказа', () => {
    const r = getReprintRoute({ order_type: 'sticker3D', need_lam: false })
    expect(r).toEqual(['print', 'cutting', 'pouring', 'drying', 'selection', 'packaging', 'done'])
  })

  it('stickerpack3D: НОВАЯ форма маршрута (selection→pouring→drying), без selection_pouring', () => {
    const r = getReprintRoute({ order_type: 'stickerpack3D', need_lam: true })
    expect(r).toEqual(['print', 'lamination', 'cutting', 'selection', 'pouring', 'drying', 'assembly_3d', 'packaging', 'done'])
    expect(r).not.toContain('selection_pouring')
  })

  it('stickerpack3D без ламинации', () => {
    const r = getReprintRoute({ order_type: 'stickerpack3D', need_lam: false })
    expect(r).not.toContain('lamination')
    expect(r[0]).toBe('print')
  })

  it('sticker_kiss (без упаковки): реприн заканчивается на резке + done', () => {
    const r = getReprintRoute({ order_type: 'sticker_kiss', need_lam: true, bopp_bag: false })
    expect(r).toEqual(['print', 'lamination', 'cutting', 'done'])
  })
})

describe('computeSubtaskStageProgress', () => {
  it('печать: суммирует stickers_printed минус брак', () => {
    const logs = [
      { stage: 'print', stickers_printed: 60, defects: 5 },
      { stage: 'print', stickers_printed: 40, defects: 0 },
      { stage: 'cutting', qty_cut: 100 },
    ]
    const p = computeSubtaskStageProgress(logs, 'print', 100)
    expect(p.total).toBe(95) // 100 - 5
    expect(p.percentage).toBe(95)
    expect(p.isComplete).toBe(false)
  })

  it('заливка: stickers_good уже за вычетом брака, повторно не вычитаем', () => {
    const logs = [{ stage: 'pouring', stickers_good: 50 }]
    const p = computeSubtaskStageProgress(logs, 'pouring', 50)
    expect(p.total).toBe(50)
    expect(p.isComplete).toBe(true)
  })

  it('сушка: годные = высушено − брак', () => {
    const logs = [{ stage: 'drying', qty_dried: 50, defects: 8 }]
    const p = computeSubtaskStageProgress(logs, 'drying', 50)
    expect(p.total).toBe(42)
    expect(p.isComplete).toBe(false)
  })

  it('игнорирует удалённые логи', () => {
    const logs = [
      { stage: 'print', stickers_printed: 100 },
      { stage: 'print', stickers_printed: 50, deleted_at: '2026-07-20' },
    ]
    expect(computeSubtaskStageProgress(logs, 'print', 100).total).toBe(100)
  })
})

describe('computeSubtaskOverallProgress', () => {
  const route = ['print', 'cutting', 'packaging', 'done']

  it('первый этап, ничего не внесено → 0%', () => {
    const p = computeSubtaskOverallProgress({ status: 'print', qty: 100, route }, [])
    expect(p.percentage).toBe(0)
    expect(p.done).toBe(false)
  })

  it('второй этап наполовину → доля пройденного + текущего', () => {
    // 3 производственных этапа; текущий cutting (idx 1), внесено 50/100 → 0.5
    // (1 + 0.5) / 3 = 50%
    const logs = [{ stage: 'cutting', qty_cut: 50 }]
    const p = computeSubtaskOverallProgress({ status: 'cutting', qty: 100, route }, logs)
    expect(p.percentage).toBe(50)
  })

  it('done → 100%', () => {
    const p = computeSubtaskOverallProgress({ status: 'done', qty: 100, route }, [])
    expect(p.percentage).toBe(100)
    expect(p.done).toBe(true)
  })
})

describe('reprintUiStatus', () => {
  const base = { status: 'print', qty: 100, paused: false }
  it('нет логов текущего этапа → В очереди', () => {
    expect(reprintUiStatus(base, [])).toBe('queued')
  })
  it('есть лог текущего этапа → В работе', () => {
    expect(reprintUiStatus(base, [{ stage: 'print', stickers_printed: 10 }])).toBe('in_progress')
  })
  it('paused → Приостановлено', () => {
    expect(reprintUiStatus({ ...base, paused: true }, [])).toBe('paused')
  })
  it('done → Завершено (даже если paused)', () => {
    expect(reprintUiStatus({ ...base, status: 'done', paused: true }, [])).toBe('done')
  })
})

describe('reprintStageFields', () => {
  it('сушка = высушено + брак', () => {
    const f = reprintStageFields('drying').map((x) => x.key)
    expect(f).toEqual(['qty_dried', 'defects'])
  })
  it('печать = напечатано + плёнка (одно изделие, без per-трек)', () => {
    const f = reprintStageFields('print').map((x) => x.key)
    expect(f).toEqual(['stickers_printed', 'film_meters'])
  })
  it('резка наследует STAGE_FIELDS.cutting.fields', () => {
    const f = reprintStageFields('cutting').map((x) => x.key)
    expect(f).toContain('qty_cut')
    expect(f).toContain('defects')
  })
})
