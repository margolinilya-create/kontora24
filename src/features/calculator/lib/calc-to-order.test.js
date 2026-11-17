import { describe, it, expect } from 'vitest'
import { calculate, DEFAULT_CALC_SETTINGS } from './calc'
import {
  mapCalcToOrder, buildCalcSnapshot, orderPricePerUnit, calcPriceDiff,
  restoreCalcState, designStatusFor,
} from './calc-to-order'

const S = DEFAULT_CALC_SETTINGS
const FILM = { id: 'film-1', material_code: 'Holo', name: 'Holo 1.27' }
const LAM = { id: 'lam-1', material_code: 'matte', name: 'Матовая 1.27' }

function calc(input) {
  return calculate({ widthMm: 100, heightMm: 100, filmGroup: 'white', views: [500], options: {}, product: 'sticker', ...input }, S)
}

describe('mapCalcToOrder — таблица 6.2', () => {
  it('стикер без 3D + поштучная резка → sticker_cut, needs_individual_cut', () => {
    const { values } = mapCalcToOrder(calc({ options: { cut: true } }))
    expect(values.order_type).toBe('sticker_cut')
    expect(values.needs_individual_cut).toBe(true)
  })

  it('стикер без 3D без резки → sticker_kiss', () => {
    const { values } = mapCalcToOrder(calc({ options: {} }))
    expect(values.order_type).toBe('sticker_kiss')
    expect(values.needs_individual_cut).toBe(false)
  })

  it('стикер + 3D → sticker3D, резка как в расчёте', () => {
    expect(mapCalcToOrder(calc({ options: { resin3d: true, cut: true } })).values)
      .toMatchObject({ order_type: 'sticker3D', needs_individual_cut: true })
    expect(mapCalcToOrder(calc({ options: { resin3d: true } })).values)
      .toMatchObject({ order_type: 'sticker3D', needs_individual_cut: false })
  })

  it('стикерпак / 3D стикерпак', () => {
    expect(mapCalcToOrder(calc({ product: 'pack' })).values.order_type).toBe('stickerpack')
    const pack3d = mapCalcToOrder(calc({ product: 'pack', options: { resin3d: true } }))
    expect(pack3d.values.order_type).toBe('stickerpack3D')
    expect(pack3d.values.needs_individual_cut).toBe(false)
    expect(pack3d.prefilledKeys).not.toContain('needs_individual_cut')
  })

  it('размер и тираж одного вида', () => {
    const { values, variants } = mapCalcToOrder(calc({ widthMm: 50, heightMm: 70, views: [300] }))
    expect(values).toMatchObject({ width_mm: 50, height_mm: 70, qty: 300 })
    expect(variants).toEqual([])
  })

  it('3 вида 100/200/200 → три вида с общим размером, тираж 500', () => {
    const { values, variants, prefilledKeys } = mapCalcToOrder(calc({ views: [100, 200, 200] }))
    expect(values.qty).toBe(500)
    expect(variants).toEqual([
      { width_mm: '', height_mm: '', qty: '100' },
      { width_mm: '', height_mm: '', qty: '200' },
      { width_mm: '', height_mm: '', qty: '200' },
    ])
    expect(prefilledKeys).toContain('variants')
  })

  it('плёнка — та же позиция склада, film_type из кода', () => {
    const { values } = mapCalcToOrder(calc({}), { film: FILM })
    expect(values.film_material_id).toBe('film-1')
    expect(values.film_type).toBe('Holo')
    // Позиция без кода → film_type по умолчанию формы.
    expect(mapCalcToOrder(calc({}), { film: { id: 'f2' } }).values.film_type).toBe('G')
  })

  it('ламинация — та же позиция; без опции — пусто', () => {
    const on = mapCalcToOrder(calc({ options: { lamination: true } }), { lam: LAM }).values
    expect(on).toMatchObject({ lam_material_id: 'lam-1', lam_type: 'matte' })
    const off = mapCalcToOrder(calc({}), { lam: LAM }).values
    expect(off).toMatchObject({ lam_material_id: null, lam_type: '' })
  })

  it('ламинация без кода позиции → lam_type glossy (ревью R25: need_lam не теряется)', () => {
    const { values } = mapCalcToOrder(calc({ options: { lamination: true } }), { lam: { id: 'lam-2' } })
    expect(values).toMatchObject({ lam_material_id: 'lam-2', lam_type: 'glossy' })
  })

  it('монтажная плёнка → needs_montage_film, позиция по умолчанию', () => {
    const { values } = mapCalcToOrder(calc({ options: { montage: true } }))
    expect(values).toMatchObject({ needs_montage_film: true, montage_material_id: null })
  })

  it('срочность / пакетик / партнёр', () => {
    const { values } = mapCalcToOrder(calc({ options: { urgent: true, bag: true, partner: true } }))
    expect(values).toMatchObject({ is_urgent: true, bopp_bag: true, is_partner: true })
    expect(mapCalcToOrder(calc({})).values).toMatchObject({ is_urgent: false, bopp_bag: false, is_partner: false })
  })

  it('3D стикерпак всегда с БОПП-пакетом (как в форме)', () => {
    expect(mapCalcToOrder(calc({ product: 'pack', options: { resin3d: true } })).values.bopp_bag).toBe(true)
  })

  it('дизайн макета: разработка / правка / предоставлен', () => {
    expect(mapCalcToOrder(calc({ options: { design: true, designEdit: true } })).values.design_status).toBe('needs_development')
    expect(mapCalcToOrder(calc({ options: { design: true } })).values.design_status).toBe('needs_development')
    expect(mapCalcToOrder(calc({ options: { designEdit: true } })).values.design_status).toBe('needs_edit')
    expect(mapCalcToOrder(calc({})).values.design_status).toBe('provided')
    expect(designStatusFor()).toBe('provided')
  })

  it('стоимость = итого расчёта (округлено до рубля)', () => {
    const r = calc({})
    expect(mapCalcToOrder(r).values.price_final).toBe(10651)
    expect(r.totalRounded).toBe(10651)
  })
})

describe('buildCalcSnapshot', () => {
  it('содержит дату, автора, историю настроек, входные данные, цену, себестоимость, наценку и текст', () => {
    const r = calc({ product: 'pack', filmGroup: 'holo', widthMm: 105, heightMm: 148, views: [200], options: { resin3d: true, lamination: true } })
    const now = new Date('2026-11-17T10:00:00Z')
    const snap = buildCalcSnapshot(r, {
      film: FILM, lam: LAM, labels: { material: 'Голографическая плёнка', lamination: 'Матовая' },
      detailedText: 'Расчёт…', author: { id: 'u1', name: 'Менеджер' }, settingsHistoryId: 42, now,
    })
    expect(snap).toMatchObject({
      version: 1,
      calculated_at: '2026-11-17T10:00:00.000Z',
      calculated_by: { id: 'u1', name: 'Менеджер' },
      settings_history_id: 42,
      order_type: 'stickerpack3D',
      qty: 200,
      total_rounded: r.totalRounded,
      price_per_unit: r.pricePerUnit,
      cost_total: r.costTotal,
      markup: r.markup,
      detailed_text: 'Расчёт…',
    })
    expect(snap.input).toMatchObject({
      product: 'pack', width_mm: 105, height_mm: 148, film_group: 'holo',
      film_material_id: 'film-1', film_name: 'Голографическая плёнка',
      lam_material_id: 'lam-1', lam_name: 'Матовая', views: [200],
    })
    expect(snap.input.options.resin3d).toBe(true)
    // JSON-сериализуемо (уходит в jsonb).
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap)
  })

  it('без ламинации позиция ламинации не сохраняется', () => {
    const snap = buildCalcSnapshot(calc({}), { lam: LAM })
    expect(snap.input.lam_material_id).toBeNull()
    expect(snap.settings_history_id).toBeNull()
    expect(snap.calculated_by).toBeNull()
  })
})

describe('orderPricePerUnit', () => {
  const snap = buildCalcSnapshot(calc({}))
  it('цена и тираж как в расчёте → цена за штуку из расчёта', () => {
    expect(orderPricePerUnit(snap, 10651, 500)).toBe(Math.round(snap.price_per_unit * 100) / 100)
  })
  it('цену изменили → пересчёт от стоимости', () => {
    expect(orderPricePerUnit(snap, 12000, 500)).toBe(24)
  })
  it('тираж изменили → пересчёт', () => {
    expect(orderPricePerUnit(snap, 10651, 1000)).toBe(10.65)
  })
  it('без цены → null', () => {
    expect(orderPricePerUnit(snap, '', 500)).toBeNull()
    expect(orderPricePerUnit(null, 1000, 0)).toBeNull()
  })
})

describe('calcPriceDiff', () => {
  const snap = { total_rounded: 36751 }
  it('цена совпадает → нет пометки', () => {
    expect(calcPriceDiff({ price_final: 36751, calc_snapshot: snap })).toBeNull()
    expect(calcPriceDiff({ price_final: '36751.00', calc_snapshot: snap })).toBeNull()
  })
  it('цена изменена → пометка с расчётной суммой', () => {
    expect(calcPriceDiff({ price_final: 35000, calc_snapshot: snap })).toEqual({ calcTotal: 36751, orderTotal: 35000, diff: -1751 })
  })
  it('нет снимка или цены (маска без view:finance) → null', () => {
    expect(calcPriceDiff({ price_final: 1 })).toBeNull()
    expect(calcPriceDiff({ price_final: null, calc_snapshot: snap })).toBeNull()
  })
})

describe('restoreCalcState', () => {
  it('снимок → состояние калькулятора, пересчёт даёт ту же цену', () => {
    const input = { product: 'sticker', filmGroup: 'white', widthMm: 100, heightMm: 100, views: [100, 200, 200], options: { urgent: true, designEdit: true } }
    const r = calc(input)
    const state = restoreCalcState(buildCalcSnapshot(r, { film: FILM }))
    expect(state).toMatchObject({ product: 'sticker', width: '100', height: '100', filmId: 'film-1', lamId: null, views: [100, 200, 200] })
    expect(state.options).toMatchObject({ urgent: true, designEdit: true, cut: false })
    const again = calculate({ product: state.product, widthMm: 100, heightMm: 100, filmGroup: 'white', views: state.views, options: state.options }, S)
    expect(again.totalRounded).toBe(r.totalRounded)
  })
  it('битый снимок → null', () => {
    expect(restoreCalcState(null)).toBeNull()
    expect(restoreCalcState({ input: { views: [] } })).toBeNull()
  })
})
