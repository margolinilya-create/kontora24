import { describe, it, expect } from 'vitest'
import { DEFAULT_CALC_SETTINGS } from './calc'
import {
  unitKind, indexMaterialPrices, resolvePrice, groupMaterials, resolveMaterial,
  materialsWithoutPrice, materialDisplayName, resolveNfc, usableMaterials,
} from './materials'

const S = DEFAULT_CALC_SETTINGS

const WHITE = { id: 'w', name: 'Orajet 3640 G 1.27', calc_price_group: 'white', group: 'Плёнка для печати', groupRank: 0 }
const HOLO = { id: 'h', name: 'Holo 1.27', calc_price_group: 'holo', group: 'Плёнка для печати', groupRank: 0 }
const PAPER = { id: 'p', name: 'Бумага Ситилайт 200', unit: 'm', roll_width_m: 1.27, group: 'Бумага в рулонах', groupRank: 1 }
const NO_WIDTH = { id: 'nw', name: 'Бумага без ширины', unit: 'м', group: 'Бумага в рулонах', groupRank: 1 }
const BAD_UNIT = { id: 'bu', name: 'Бумага в листах', unit: 'шт', group: 'Бумага в рулонах', groupRank: 1 }
const NO_COST = { id: 'nc', name: 'Бумага без цены', unit: 'м²', group: 'Бумага в рулонах', groupRank: 1 }

const { prices, nfc } = indexMaterialPrices([
  { id: 'w', unit: 'м', roll_width_m: 1.27, price_cm2_raw: 0.01 },
  { id: 'p', unit: 'm', roll_width_m: 1.27, price_cm2_raw: 185.35 / 12700 },
  { id: 'nw', unit: 'м', roll_width_m: null, price_cm2_raw: null },
  { id: 'bu', unit: 'шт', roll_width_m: null, price_cm2_raw: null },
  { id: 'nc', unit: 'м²', roll_width_m: null, price_cm2_raw: null },
  { id: 'nfc', unit: 'шт', price_cm2_raw: null, nfc_unit_price: 6.82, is_nfc: true, archived: false },
])

describe('unitKind', () => {
  it('м / латинская m — погонный, м² / m2 — квадратный, иначе нет', () => {
    expect(unitKind('м')).toBe('linear')
    expect(unitKind('m')).toBe('linear')
    expect(unitKind(' М ')).toBe('linear')
    expect(unitKind('м²')).toBe('square')
    expect(unitKind('m2')).toBe('square')
    expect(unitKind('шт')).toBeNull()
    expect(unitKind(null)).toBeNull()
  })
})

describe('resolvePrice', () => {
  it('с группой — цена группы, даже если есть цена склада', () => {
    expect(resolvePrice(WHITE, prices, S)).toMatchObject({ source: 'group', priceCm2: 0.03, reason: null })
    expect(resolvePrice(HOLO, prices, S).priceCm2).toBe(0.04)
  })

  it('без группы — цена склада × K', () => {
    const p = resolvePrice(PAPER, prices, S)
    expect(p.source).toBe('warehouse')
    expect(p.priceCm2Raw).toBeCloseTo(0.014594, 6)
    expect(Math.round(p.priceCm2 * 10000) / 10000).toBe(0.0219)
  })

  it('причины неактивности', () => {
    expect(resolvePrice(NO_WIDTH, prices, S)).toMatchObject({ priceCm2: null, reason: 'нет ширины рулона' })
    expect(resolvePrice(BAD_UNIT, prices, S)).toMatchObject({ priceCm2: null, reason: 'единица не м/м²' })
    expect(resolvePrice(NO_COST, prices, S)).toMatchObject({ priceCm2: null, reason: 'нет цены на складе' })
    // Без данных RPC (функция ещё не применена) — по позиции.
    expect(resolvePrice(PAPER, new Map(), S)).toMatchObject({ priceCm2: null, reason: 'нет цены на складе' })
  })
})

describe('groupMaterials', () => {
  it('три ценовые группы, затем категории позиций без группы', () => {
    const g = groupMaterials([PAPER, HOLO, WHITE, NO_WIDTH, { ...WHITE, id: 'arch', archived_at: '2026-01-01' }], prices, S)
    expect(g.map((x) => x.label)).toEqual(['Белая / прозрачная', 'Голографическая', 'Бумага в рулонах'])
    expect(g[0].items.map((i) => i.id)).toEqual(['w'])
    expect(g[2].items.map((i) => [i.id, i.price.priceCm2 != null])).toEqual([['p', true], ['nw', false]])
  })
})

describe('resolveMaterial / usableMaterials / materialsWithoutPrice', () => {
  const list = [NO_WIDTH, PAPER, WHITE]
  it('выбранная → по умолчанию → первая с ценой', () => {
    expect(resolveMaterial(list, prices, S, 'p', null).id).toBe('p')
    expect(resolveMaterial(list, prices, S, 'nw', 'w').id).toBe('w')
    expect(resolveMaterial(list, prices, S, null, null).id).toBe('p')
    expect(resolveMaterial([NO_WIDTH], prices, S, null, null)).toBeNull()
  })
  it('список без автоцены для предупреждения в настройках', () => {
    expect(usableMaterials(list, prices, S).map((m) => m.id)).toEqual(['p', 'w'])
    expect(materialsWithoutPrice(list, prices, S)).toEqual([{ id: 'nw', name: 'Бумага без ширины', reason: 'нет ширины рулона' }])
  })
})

describe('materialDisplayName', () => {
  it('«Название в расчёте» → имя группы → категория', () => {
    expect(materialDisplayName({ ...PAPER, calc_display_name: 'Бумага Ситилайт 200 г' })).toBe('Бумага Ситилайт 200 г')
    expect(materialDisplayName(WHITE)).toBe('Белая плёнка')
    expect(materialDisplayName(PAPER)).toBe('Бумага в рулонах')
    expect(materialDisplayName({ id: 'x', name: 'Склад', category_name: 'Бумага в рулонах' })).toBe('Бумага в рулонах')
    expect(materialDisplayName({ id: 'x', name: 'Склад' })).toBe('Склад')
    expect(materialDisplayName(null)).toBe('')
  })
})

describe('resolveNfc', () => {
  const mats = [{ id: 'nfc', name: 'NFC-метки (NTAG216)', stock_qty: 303, category_id: 'kit' }]
  it('позиция задана и с ценой → доступна, остаток', () => {
    const r = resolveNfc({ ...S, nfc_material_id: 'nfc' }, nfc, mats)
    expect(r).toMatchObject({ available: true, price: 6.82, stock: 303 })
    expect(r.material.category_id).toBe('kit')
  })
  it('не задана / в архиве / без цены → недоступна с подсказкой', () => {
    expect(resolveNfc(S, nfc, mats)).toMatchObject({ available: false, reason: expect.stringMatching(/не задана/) })
    expect(resolveNfc({ ...S, nfc_material_id: 'nfc' }, { ...nfc, archived: true }, []))
      .toMatchObject({ available: false, reason: expect.stringMatching(/архиве/) })
    expect(resolveNfc({ ...S, nfc_material_id: 'nfc' }, { ...nfc, nfc_unit_price: null }, mats))
      .toMatchObject({ available: false, reason: expect.stringMatching(/нет цены/) })
  })
})
