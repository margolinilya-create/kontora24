import { describe, it, expect } from 'vitest'
import {
  buildCostMap, costForOrder, compareCodeCandidates,
  aggregateMaterialUsage, withMaterialUnitCosts,
} from './materials-cost'

describe('buildCostMap — дубли material_code (код-ревью 17.11)', () => {
  const dupes = [
    { id: 'b', name: 'Orajet G', material_code: 'G', type: 'film', unit_cost: 235 },
    { id: 'a', name: 'Duckson G', material_code: 'G', type: 'film', unit_cost: 130 },
    { id: 'c', name: 'Аааа архив', material_code: 'G', type: 'film', unit_cost: 50, archived_at: '2026-01-01' },
    { id: 'd', name: 'Без цены', material_code: 'G', type: 'film', unit_cost: 0 },
  ]
  it('не зависит от порядка строк: не архивная, затем по имени', () => {
    expect(buildCostMap(dupes).byCode.G).toBe(130)
    expect(buildCostMap([...dupes].reverse()).byCode.G).toBe(130)
  })
  it('при равных именах — по id', () => {
    const same = [
      { id: 'z', name: 'X', material_code: 'M', type: 'film', unit_cost: 2 },
      { id: 'y', name: 'X', material_code: 'M', type: 'film', unit_cost: 1 },
    ]
    expect(buildCostMap(same).byCode.M).toBe(1)
  })
  it('compareCodeCandidates: архивная проигрывает', () => {
    expect(compareCodeCandidates({ name: 'Я' }, { name: 'А', archived_at: 'x' })).toBeLessThan(0)
  })
})

describe('aggregateMaterialUsage + withMaterialUnitCosts', () => {
  it('суммирует расход и раскладывает плёнку по кодам (стикеры 3D-пака — своя плёнка)', () => {
    const order = { order_type: 'stickerpack3D', film_type: 'G', film_type_stickers: 'Holo', lam_type: 'matte' }
    const u = aggregateMaterialUsage([
      { film_meters: 2, track: 'backgrounds' },
      { film_meters: 3, track: 'stickers' },
      { film_meters: 1, film_type: 'M' },
      { lamination_meters: 4, montage_meters: 1, resin_grams: 10, boxes_used: 2 },
    ], order)
    expect(u.actual_film).toBe(6)
    expect(u.actual_film_by_type).toEqual({ G: 2, Holo: 3, M: 1 })
    expect(u.actual_lam_by_type).toEqual({ matte: 4 })
    expect(u).toMatchObject({ actual_lam: 4, actual_montage: 1, actual_resin: 10, boxes_used: 2 })
  })

  it('embed лога без film_type не затирает поля заказа', () => {
    const u = aggregateMaterialUsage([{ film_meters: 5, order: { order_type: 'sticker3D' } }], { film_type: 'G' })
    expect(u.actual_film_by_type).toEqual({ G: 5 })
  })

  it('WAC по выбранной позиции заказа приоритетнее кода', () => {
    const mats = { m1: { id: 'm1', name: 'Orajet', material_code: null, unit_cost: 235 } }
    const o = withMaterialUnitCosts({ film_material_id: 'm1', film_type: 'G' }, mats)
    expect(o.film_material).toMatchObject({ id: 'm1', unit_cost: 235 })
    const cost = costForOrder(
      { ...o, ...aggregateMaterialUsage([{ film_meters: 2 }], o) },
      buildCostMap([{ material_code: 'G', unit_cost: 100 }]),
    )
    expect(cost.film).toBe(470)
  })
})
