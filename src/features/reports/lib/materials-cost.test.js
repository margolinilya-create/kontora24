import { describe, it, expect } from 'vitest'
import { buildCostMap, costForOrder } from './materials-cost'

const MATERIALS = [
  { material_code: 'G', type: 'film', unit_cost: 200 },
  { material_code: 'M', type: 'film', unit_cost: 230 },
  { material_code: 'matte', type: 'lam_film', unit_cost: 130 },
  { material_code: 'resin', type: 'resin', unit_cost: 2.5 },
  { material_code: null, type: 'box', unit_cost: 30 },
  { material_code: null, type: 'box', unit_cost: 50 },
]

describe('buildCostMap', () => {
  it('строит byCode по material_code и avgByType по типу', () => {
    const map = buildCostMap(MATERIALS)
    expect(map.byCode.G).toBe(200)
    expect(map.byCode.resin).toBe(2.5)
    expect(map.avgByType.box).toBe(40) // (30+50)/2
  })

  it('пропускает позиции без кода и с нулевой ценой', () => {
    const map = buildCostMap([{ material_code: null, type: 'film', unit_cost: 100 }, { material_code: 'G', type: 'film', unit_cost: 0 }])
    expect(map.byCode.G).toBeUndefined()
  })
})

describe('costForOrder (R20.2: приоритет позиции склада)', () => {
  const costMap = buildCostMap(MATERIALS)

  it('legacy-фолбэк: без film_material считает по material_code', () => {
    const row = { actual_film: 10, actual_film_by_type: { G: 10 }, actual_lam_by_type: {}, actual_resin: 0, boxes_used: 0 }
    expect(costForOrder(row, costMap).film).toBe(10 * 200)
  })

  it('выбранная позиция приоритетнее кода (Orajet без кода — раньше 0 ₽)', () => {
    const row = {
      actual_film: 12, actual_film_by_type: { G: 12 },
      film_material: { name: 'Orajet 3640 белая (Глянцевая)', material_code: null, unit_cost: 153 },
      actual_lam_by_type: {}, actual_resin: 0, boxes_used: 0,
    }
    // Все метры по цене выбранной позиции, а не по byCode['G'] (Duckson).
    expect(costForOrder(row, costMap).film).toBe(12 * 153)
  })

  it('метры без кода вообще (byType пуст) считаются через actual_film × позиция', () => {
    const row = {
      actual_film: 7, actual_film_by_type: {},
      film_material: { unit_cost: 100 },
      actual_lam_by_type: {}, actual_resin: 0, boxes_used: 0,
    }
    expect(costForOrder(row, costMap).film).toBe(700)
  })

  it('3D-пак с разными плёнками: метры делятся по кодам треков', () => {
    const row = {
      film_type: 'G', film_type_stickers: 'Holo',
      actual_film: 15, actual_film_by_type: { G: 10, Holo: 5 },
      film_material: { unit_cost: 150 },          // фоны
      film_stickers_material: { unit_cost: 240 }, // стикеры
      actual_lam_by_type: {}, actual_resin: 0, boxes_used: 0,
    }
    expect(costForOrder(row, costMap).film).toBe(10 * 150 + 5 * 240)
  })

  it('ламинация по выбранной позиции; смола и коробки как раньше', () => {
    const row = {
      actual_film: 0, actual_film_by_type: {},
      actual_lam: 4, actual_lam_by_type: { matte: 4 },
      lam_material: { unit_cost: 145 },
      actual_resin: 100, boxes_used: 2,
    }
    const c = costForOrder(row, costMap)
    expect(c.lam).toBe(4 * 145)      // позиция, не byCode.matte=130
    expect(c.resin).toBe(100 * 2.5)
    expect(c.box).toBe(2 * 40)
    expect(c.total).toBe(c.film + c.lam + c.resin + c.box)
  })

  it('битая/нулевая цена позиции → фолбэк на material_code', () => {
    const row = {
      actual_film: 10, actual_film_by_type: { M: 10 },
      film_material: { unit_cost: 0 },
      actual_lam_by_type: {}, actual_resin: 0, boxes_used: 0,
    }
    expect(costForOrder(row, costMap).film).toBe(10 * 230)
  })

  it('ревью 05.07: выбрана только позиция фонов — метры плёнки стикеров НЕ ценятся по ней', () => {
    // 3D-пак: film_material_id задан (фоны, 150 ₽/м), film_stickers_material_id
    // NULL. Раньше все 15 м (включая 5 м стикеров кода M) шли по 150 ₽ —
    // теперь стикеры падают на legacy-фолбэк material_code (M = 230).
    const row = {
      film_type: 'G', film_type_stickers: 'M',
      actual_film: 15, actual_film_by_type: { G: 10, M: 5 },
      film_material: { unit_cost: 150 },
      film_stickers_material: null,
      actual_lam_by_type: {}, actual_resin: 0, boxes_used: 0,
    }
    expect(costForOrder(row, costMap).film).toBe(10 * 150 + 5 * 230)
  })

  it('ревью 05.07: одинаковый код двух треков — метры не различимы, идут по позиции фонов', () => {
    const row = {
      film_type: 'G', film_type_stickers: 'G',
      actual_film: 12, actual_film_by_type: { G: 12 },
      film_material: { unit_cost: 150 },
      film_stickers_material: { unit_cost: 999 },
      actual_lam_by_type: {}, actual_resin: 0, boxes_used: 0,
    }
    expect(costForOrder(row, costMap).film).toBe(12 * 150)
  })
})
