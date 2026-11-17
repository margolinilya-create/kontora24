// R25.7B (ТЗ 17.11, Фаза 7, раздел 7.5) — категории склада в заказе.
// Чистые функции без React: какие позиции склада показывать в полях заказа
// («Плёнка» / «Ламинация» / дополнительные материалы), прогноз «норма × тираж»
// и сбор расхода доп. материалов для записи учёта (extra_consumption).

/** Поля заказа, к которым привязывается категория (CHECK в миграции 105). */
export const ORDER_FIELDS = {
  print: { label: 'Материал печати', defaultStage: 'print', fallbackType: 'film' },
  lamination: { label: 'Ламинация', defaultStage: 'lamination', fallbackType: 'lam_film' },
  extra: { label: 'Дополнительный материал', defaultStage: null, fallbackType: null },
}

/** Колонки категорий для чтения (миграция 084 + 105). */
export const CATEGORY_COLS = 'id, name, sort_order, show_in_order, order_field, consume_stage, norm_per_item, count_in_costs'

/** Категории, отмеченные «Показывать при заведении заказа» для поля field. */
export function categoriesForField(categories, field) {
  return (categories || [])
    .filter((c) => c && c.show_in_order && c.order_field === field)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name)))
}

/**
 * Позиции склада для поля «Материал печати» / «Ламинация».
 *
 * Если хотя бы одна категория отмечена для поля — позиции этих категорий,
 * сгруппированные по категории (порядок категорий — sort_order). Позиции без
 * категории со служебным типом поля (film / lam_film) тоже попадают в список
 * отдельной группой — чтобы не потерять позиции, которым ещё не назначили
 * категорию. Если ни одна категория не отмечена — прежнее поведение: все
 * позиции служебного типа одной группой (group = null).
 *
 * @returns {{ grouped: boolean, items: Array<object & { group: string|null }> }}
 */
export function orderFieldMaterials(materials, categories, field) {
  const fallbackType = ORDER_FIELDS[field]?.fallbackType
  const list = (materials || []).filter(Boolean)
  const cats = categoriesForField(categories, field)
  if (cats.length === 0) {
    return {
      grouped: false,
      items: list.filter((m) => m.type === fallbackType).map((m) => ({ ...m, group: null })),
    }
  }
  const catById = new Map(cats.map((c, i) => [c.id, { name: c.name, rank: i }]))
  const items = []
  for (const m of list) {
    const cat = m.category_id ? catById.get(m.category_id) : null
    if (cat) {
      items.push({ ...m, group: cat.name, groupRank: cat.rank })
    } else if (!m.category_id && fallbackType && m.type === fallbackType) {
      items.push({ ...m, group: 'Без категории', groupRank: cats.length })
    }
  }
  return { grouped: true, items }
}

/**
 * Группировка уже отсортированных опций по полю group (порядок групп —
 * groupRank, внутри — исходный порядок). Для <optgroup>.
 */
export function groupOptions(options) {
  const groups = new Map()
  for (const o of options) {
    const key = o.group ?? ''
    if (!groups.has(key)) groups.set(key, { label: o.group, rank: o.groupRank ?? 0, options: [] })
    groups.get(key).options.push(o)
  }
  return [...groups.values()].sort((a, b) => a.rank - b.rank)
}

/**
 * Категории доп. материалов, которые показываются в заказе: отмечены
 * «extra» и их этап списания есть в маршруте заказа (без этапа — не
 * показываем: расход внести будет негде).
 */
export function extraCategoriesForRoute(categories, route) {
  const stages = new Set(route || [])
  return categoriesForField(categories, 'extra').filter((c) => c.consume_stage && stages.has(c.consume_stage))
}

/** Позиции категории (не архивные + текущая выбранная, даже если в архиве). */
export function materialsOfCategory(materials, categoryId, selectedId = null) {
  return (materials || []).filter((m) => m && m.category_id === categoryId && (!m.archived_at || m.id === selectedId))
}

/**
 * Прогноз доп. материалов: норма × тираж по каждой выбранной позиции.
 * @param {Array} extraCats — результат extraCategoriesForRoute
 * @param {Record<string,string|null>} selection — { [categoryId]: materialId }
 * @param {number} qty — тираж
 * @param {Array} materials — позиции склада (для единицы)
 * @returns {Array<{key,label,expected,unit,lookup}>} строки в формате forecastMaterials
 */
export function forecastExtraMaterials(extraCats, selection, qty, materials) {
  const q = Number(qty) || 0
  if (q <= 0) return []
  const byId = new Map((materials || []).map((m) => [m.id, m]))
  const rows = []
  for (const c of extraCats || []) {
    const materialId = selection?.[c.id]
    const norm = Number(c.norm_per_item)
    if (!materialId || !(norm > 0)) continue
    const m = byId.get(materialId)
    rows.push({
      key: `extra:${c.id}`,
      label: c.name,
      expected: Math.round(norm * q * 1000) / 1000,
      unit: m?.unit || 'шт',
      lookup: { by: 'materialId', value: materialId },
    })
  }
  return rows
}

/**
 * Поля «Расход: <категория>» для формы учёта на этапе stage: категории с
 * order_field=extra и consume_stage=stage, для которых в заказе выбрана позиция.
 * @param {Array} categories
 * @param {Array<{category_id, material_id}>} orderMaterials — строки k24_order_materials
 * @param {string} stage
 * @param {Array} materials — позиции (имя/единица)
 */
export function extraConsumptionFields(categories, orderMaterials, stage, materials) {
  if (!stage) return []
  const byId = new Map((materials || []).map((m) => [m.id, m]))
  const selByCat = new Map((orderMaterials || []).map((r) => [r.category_id, r.material_id]))
  return categoriesForField(categories, 'extra')
    .filter((c) => c.consume_stage === stage && selByCat.get(c.id))
    .map((c) => {
      const materialId = selByCat.get(c.id)
      const m = byId.get(materialId)
      return {
        categoryId: c.id,
        materialId,
        label: `Расход: ${c.name}`,
        materialName: m?.name || null,
        unit: m?.unit || null,
      }
    })
}

/**
 * Значения формы { [materialId]: '1.5' } → объект для extra_consumption
 * ({ [materialId]: 1.5 }). Пустые / нулевые / некорректные значения
 * отбрасываются. Отрицательные — ошибка (возвращается в error).
 */
export function buildExtraConsumption(values, fields) {
  const out = {}
  for (const f of fields || []) {
    const raw = values?.[f.materialId]
    if (raw === '' || raw == null) continue
    const n = Number(String(raw).replace(',', '.'))
    if (!Number.isFinite(n)) return { value: null, error: `${f.label}: введите число` }
    if (n < 0) return { value: null, error: `${f.label}: не может быть отрицательным` }
    if (n === 0) continue
    out[f.materialId] = n
  }
  return { value: out, error: null }
}

/**
 * Разница выбора доп. материалов заказа: что вставить/обновить и что удалить.
 * @param {Array<{id, category_id, material_id}>} current — строки k24_order_materials
 * @param {Record<string,string|null>} selection — { [categoryId]: materialId|null }
 * @param {Array<string>} allowedCategoryIds — категории, видимые в форме (остальное не трогаем)
 */
export function diffOrderMaterials(current, selection, allowedCategoryIds) {
  const allowed = new Set(allowedCategoryIds || [])
  const curByCat = new Map((current || []).map((r) => [r.category_id, r]))
  const upserts = []
  const deletes = []
  for (const catId of allowed) {
    const want = selection?.[catId] || null
    const cur = curByCat.get(catId)
    if (want && (!cur || cur.material_id !== want)) upserts.push({ category_id: catId, material_id: want })
    if (!want && cur) deletes.push(cur.id)
  }
  return { upserts, deletes }
}
