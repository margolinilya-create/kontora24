import { describe, it, expect } from 'vitest'
import {
  categoriesForField, orderFieldMaterials, groupOptions, extraCategoriesForRoute,
  materialsOfCategory, forecastExtraMaterials, extraConsumptionFields,
  buildExtraConsumption, diffOrderMaterials,
} from './order-material-categories'

const CAT_FILM = { id: 'c-film', name: 'Плёнка для печати', sort_order: 0, show_in_order: true, order_field: 'print', consume_stage: 'print' }
const CAT_LAM = { id: 'c-lam', name: 'Плёнка для ламинации', sort_order: 1, show_in_order: true, order_field: 'lamination', consume_stage: 'lamination' }
const CAT_PAPER = { id: 'c-paper', name: 'Бумага в рулонах', sort_order: 9, show_in_order: true, order_field: 'print', consume_stage: 'print' }
const CAT_PARTS = { id: 'c-parts', name: 'Комплектующие', sort_order: 10, show_in_order: true, order_field: 'extra', consume_stage: 'cutting', norm_per_item: 2 }
const CAT_TOOLS = { id: 'c-tools', name: 'Утварь', sort_order: 3, show_in_order: false, order_field: null }

const MATERIALS = [
  { id: 'f1', type: 'film', name: 'Orajet G', category_id: 'c-film', unit: 'м' },
  { id: 'f2', type: 'film', name: 'Без категории', category_id: null, unit: 'м' },
  { id: 'p1', type: 'utensils', name: 'Бумага 1м', category_id: 'c-paper', unit: 'м' },
  { id: 'l1', type: 'lam_film', name: 'Lam M', category_id: 'c-lam', unit: 'м' },
  { id: 'x1', type: 'utensils', name: 'Магнит', category_id: 'c-parts', unit: 'шт' },
  { id: 'x2', type: 'utensils', name: 'Магнит старый', category_id: 'c-parts', unit: 'шт', archived_at: '2026-01-01' },
  { id: 't1', type: 'utensils', name: 'Нож', category_id: 'c-tools', unit: 'шт' },
]

describe('orderFieldMaterials', () => {
  it('без отмеченных категорий — прежний список по служебному типу', () => {
    const r = orderFieldMaterials(MATERIALS, [CAT_TOOLS], 'print')
    expect(r.grouped).toBe(false)
    expect(r.items.map((m) => m.id)).toEqual(['f1', 'f2'])
    expect(orderFieldMaterials(MATERIALS, [], 'lamination').items.map((m) => m.id)).toEqual(['l1'])
  })

  it('по отметкам: «Бумага в рулонах» попадает в материал печати, группы по категориям', () => {
    const r = orderFieldMaterials(MATERIALS, [CAT_PAPER, CAT_FILM, CAT_LAM, CAT_PARTS], 'print')
    expect(r.grouped).toBe(true)
    expect(r.items.map((m) => m.id).sort()).toEqual(['f1', 'f2', 'p1'])
    const groups = groupOptions(r.items)
    expect(groups.map((g) => g.label)).toEqual(['Плёнка для печати', 'Бумага в рулонах', 'Без категории'])
  })

  it('ламинация не тянет материалы печати и доп. материалы', () => {
    const r = orderFieldMaterials(MATERIALS, [CAT_FILM, CAT_LAM, CAT_PARTS], 'lamination')
    expect(r.items.map((m) => m.id)).toEqual(['l1'])
  })

  it('категория без «Показывать при заведении заказа» не участвует', () => {
    expect(categoriesForField([{ ...CAT_PAPER, show_in_order: false }], 'print')).toEqual([])
  })
})

describe('extraCategoriesForRoute', () => {
  it('показывает доп. материал, только если этап списания есть в маршруте', () => {
    expect(extraCategoriesForRoute([CAT_PARTS], ['print', 'cutting', 'packaging'])).toHaveLength(1)
    expect(extraCategoriesForRoute([CAT_PARTS], ['print', 'packaging'])).toHaveLength(0)
    expect(extraCategoriesForRoute([{ ...CAT_PARTS, consume_stage: null }], ['cutting'])).toHaveLength(0)
  })
})

describe('materialsOfCategory', () => {
  it('без архивных, кроме текущего выбора', () => {
    expect(materialsOfCategory(MATERIALS, 'c-parts').map((m) => m.id)).toEqual(['x1'])
    expect(materialsOfCategory(MATERIALS, 'c-parts', 'x2').map((m) => m.id)).toEqual(['x1', 'x2'])
  })
})

describe('forecastExtraMaterials', () => {
  it('норма × тираж по выбранной позиции', () => {
    const rows = forecastExtraMaterials([CAT_PARTS], { 'c-parts': 'x1' }, 150, MATERIALS)
    expect(rows).toEqual([{
      key: 'extra:c-parts', label: 'Комплектующие', expected: 300, unit: 'шт',
      lookup: { by: 'materialId', value: 'x1' },
    }])
  })
  it('без нормы, без выбора или без тиража — нет строки', () => {
    expect(forecastExtraMaterials([{ ...CAT_PARTS, norm_per_item: null }], { 'c-parts': 'x1' }, 10, MATERIALS)).toEqual([])
    expect(forecastExtraMaterials([CAT_PARTS], {}, 10, MATERIALS)).toEqual([])
    expect(forecastExtraMaterials([CAT_PARTS], { 'c-parts': 'x1' }, 0, MATERIALS)).toEqual([])
  })
})

describe('extraConsumptionFields', () => {
  const rows = [{ category_id: 'c-parts', material_id: 'x1' }]
  it('поле «Расход: <категория>» на этапе списания при выбранной позиции', () => {
    const f = extraConsumptionFields([CAT_PARTS], rows, 'cutting', MATERIALS)
    expect(f).toEqual([{ categoryId: 'c-parts', materialId: 'x1', label: 'Расход: Комплектующие', materialName: 'Магнит', unit: 'шт' }])
  })
  it('другой этап или нет выбора — полей нет (форма не меняется)', () => {
    expect(extraConsumptionFields([CAT_PARTS], rows, 'print', MATERIALS)).toEqual([])
    expect(extraConsumptionFields([CAT_PARTS], [], 'cutting', MATERIALS)).toEqual([])
  })
})

describe('buildExtraConsumption', () => {
  const fields = [{ materialId: 'x1', label: 'Расход: Комплектующие' }, { materialId: 'x3', label: 'Расход: Клей' }]
  it('числа с запятой, пустые и нули отбрасываются', () => {
    expect(buildExtraConsumption({ x1: '1,5', x3: '' }, fields)).toEqual({ value: { x1: 1.5 }, error: null })
    expect(buildExtraConsumption({ x1: '0' }, fields)).toEqual({ value: {}, error: null })
    expect(buildExtraConsumption({}, [])).toEqual({ value: {}, error: null })
  })
  it('отрицательное и не число — ошибка', () => {
    expect(buildExtraConsumption({ x1: '-2' }, fields).error).toMatch(/отрицательным/)
    expect(buildExtraConsumption({ x1: 'abc' }, fields).error).toMatch(/число/)
  })
})

describe('diffOrderMaterials', () => {
  const current = [
    { id: 'r1', category_id: 'c-parts', material_id: 'x1' },
    { id: 'r2', category_id: 'c-glue', material_id: 'g1' },
    { id: 'r3', category_id: 'c-hidden', material_id: 'h1' },
  ]
  it('upsert изменённых, delete снятых, скрытые категории не трогает', () => {
    const d = diffOrderMaterials(current, { 'c-parts': 'x2', 'c-glue': null, 'c-new': 'n1' }, ['c-parts', 'c-glue', 'c-new'])
    expect(d.upserts).toEqual([
      { category_id: 'c-parts', material_id: 'x2' },
      { category_id: 'c-new', material_id: 'n1' },
    ])
    expect(d.deletes).toEqual(['r2'])
  })
  it('без изменений — пусто', () => {
    expect(diffOrderMaterials(current, { 'c-parts': 'x1' }, ['c-parts'])).toEqual({ upserts: [], deletes: [] })
  })
})
