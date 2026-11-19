// R25.5 → R27.2 (ТЗ 19.11, №4): материалы печати, ламинация и NFC-метка склада
// для калькулятора (чистые функции, без React и Supabase).
//
// Цена материала:
//   • позиция с ценовой группой (white/holo/metal) — цена группы из настроек;
//   • без группы — автоцена по складу: c = unit_cost / (ширина рулона · 10 000)
//     для единицы «м» (или латинской «m»), c = unit_cost / 10 000 для «м²»;
//     в расчёте c × K (коэффициент материала из настроек). Сырая цена
//     price_cm2_raw приходит из RPC calc_material_prices (миграция 111a).
//   • ни того, ни другого — позиция неактивна, с причиной.
import { FILM_GROUPS, normalizeSettings } from './calc'

export const GROUP_ORDER = ['white', 'holo', 'metal']

/** Вид единицы позиции: 'linear' (м / m), 'square' (м² / m2), иначе null. */
export function unitKind(unit) {
  const u = String(unit ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/\.$/, '')
  if (u === 'м' || u === 'm') return 'linear'
  if (u === 'м²' || u === 'м2' || u === 'm²' || u === 'm2' || u === 'кв.м' || u === 'кв.м.') return 'square'
  return null
}

/**
 * Строки RPC calc_material_prices → { prices: Map(id → row), nfc: row|null }.
 * Строки с is_nfc — отдельно (одна позиция NFC-метки).
 */
export function indexMaterialPrices(rows) {
  const prices = new Map()
  let nfc = null
  for (const r of rows || []) {
    if (!r || !r.id) continue
    if (r.is_nfc) nfc = r
    else prices.set(r.id, r)
  }
  return { prices, nfc }
}

const positive = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Цена 1 см² позиции для калькулятора.
 * @param {Object} material — позиция склада (calc_price_group, unit, roll_width_m)
 * @param {Map|Object} prices — id → строка calc_material_prices
 * @param {Object} settings — настройки калькулятора
 * @returns {{ source: 'group'|'warehouse'|null, priceCm2: number|null,
 *             priceCm2Raw: number|null, reason: string|null }}
 *   priceCm2 — цена в расчёте (группа или склад × K); priceCm2Raw — склад без K.
 */
export function resolvePrice(material, prices, settings) {
  if (!material) return { source: null, priceCm2: null, priceCm2Raw: null, reason: 'Материал не выбран' }
  const s = normalizeSettings(settings)
  if (material.calc_price_group && FILM_GROUPS[material.calc_price_group]) {
    const v = Number(s.film_prices[material.calc_price_group])
    return { source: 'group', priceCm2: Number.isFinite(v) ? v : null, priceCm2Raw: null, reason: null }
  }
  const row = prices instanceof Map ? prices.get(material.id) : prices?.[material.id]
  const raw = positive(row?.price_cm2_raw)
  if (raw != null) {
    return { source: 'warehouse', priceCm2: raw * s.material_k, priceCm2Raw: raw, reason: null }
  }
  const unit = row?.unit ?? material.unit
  const width = row?.roll_width_m ?? material.roll_width_m
  const kind = unitKind(unit)
  let reason = 'нет цены на складе'
  if (!kind) reason = 'единица не м/м²'
  else if (kind === 'linear' && !positive(width)) reason = 'нет ширины рулона'
  return { source: null, priceCm2: null, priceCm2Raw: null, reason }
}

/** Название категории позиции (из orderFieldMaterials → group, из view → category_name). */
function categoryLabel(m) {
  if (m.group && m.group !== 'Без категории') return m.group
  return m.category_name || m.group || 'Прочее'
}

/**
 * Список «Материал»: сначала три ценовые группы, затем позиции без группы —
 * по категориям склада. Каждая позиция — с ценой и причиной неактивности.
 * @returns {Array<{ key, label, items: Array<object & { price }> }>}
 */
export function groupMaterials(materials, prices, settings) {
  const active = (materials || []).filter((m) => m && !m.archived_at)
  const withPrice = active.map((m) => ({ ...m, price: resolvePrice(m, prices, settings) }))
  const out = GROUP_ORDER
    .map((g) => ({
      key: `group:${g}`,
      label: FILM_GROUPS[g].label,
      items: withPrice.filter((m) => m.calc_price_group === g),
    }))
    .filter((g) => g.items.length > 0)
  const byCat = new Map()
  for (const m of withPrice) {
    if (m.calc_price_group && FILM_GROUPS[m.calc_price_group]) continue
    const label = categoryLabel(m)
    if (!byCat.has(label)) byCat.set(label, { key: `cat:${label}`, label, rank: m.groupRank ?? 999, items: [] })
    byCat.get(label).items.push(m)
  }
  const cats = [...byCat.values()].sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, 'ru'))
  return [...out, ...cats.map(({ rank: _rank, ...g }) => g)]
}

/** Позиции, которые можно выбрать (есть цена группы или автоцена). */
export function usableMaterials(materials, prices, settings) {
  return (materials || []).filter((m) => m && !m.archived_at && resolvePrice(m, prices, settings).priceCm2 != null)
}

/** Позиции без цены (ни группы, ни автоцены) — предупреждение в настройках. */
export function materialsWithoutPrice(materials, prices, settings) {
  return (materials || [])
    .filter((m) => m && !m.archived_at)
    .map((m) => ({ material: m, price: resolvePrice(m, prices, settings) }))
    .filter((x) => x.price.priceCm2 == null)
    .map((x) => ({ id: x.material.id, name: x.material.name, reason: x.price.reason }))
}

/** Сколько активных позиций без цены («Не настроены для калькулятора»). */
export function countUnmappedFilms(materials, prices = null, settings = null) {
  return materialsWithoutPrice(materials, prices, settings).length
}

/**
 * Выбор материала: явно выбранный → по умолчанию из настроек → первый доступный.
 * Только позиции с ценой. Возвращает null, если ни одна позиция не доступна.
 */
export function resolveMaterial(materials, prices, settings, selectedId, defaultId) {
  const usable = usableMaterials(materials, prices, settings)
  return usable.find((f) => f.id === selectedId)
    || usable.find((f) => f.id === defaultId)
    || usable[0]
    || null
}

/** «Название в расчёте» → общее имя группы → название категории → складское имя. */
export function materialDisplayName(material) {
  if (!material) return ''
  const own = material.calc_display_name?.trim()
  if (own) return own
  const group = FILM_GROUPS[material.calc_price_group]?.defaultName
  if (group) return group
  const cat = material.group && material.group !== 'Без категории' ? material.group : material.category_name
  return cat || material.name
}

/** Ламинация калькулятора — матовые/глянцевые позиции склада. */
export function laminationOptions(laminations) {
  return (laminations || []).filter((m) => !m.archived_at && (m.material_code === 'matte' || m.material_code === 'glossy'))
}

export function laminationDisplayName(lam) {
  if (!lam) return null
  if (lam.material_code === 'matte') return 'Матовая'
  if (lam.material_code === 'glossy') return 'Глянцевая'
  return lam.name
}

/**
 * NFC-метка калькулятора: позиция из настроек + её цена (RPC) + остаток.
 * @param {Object} settings
 * @param {Object|null} nfcRow — строка calc_material_prices с is_nfc
 * @param {Array} materials — позиции склада (для имени, остатка, категории)
 * @returns {{ available: boolean, reason: string|null, price: number|null,
 *             material: Object|null, stock: number|null }}
 */
export function resolveNfc(settings, nfcRow, materials) {
  const s = normalizeSettings(settings)
  const id = s.nfc_material_id
  if (!id) return { available: false, reason: 'Позиция NFC-метки не задана в настройках', price: null, material: null, stock: null }
  const material = (materials || []).find((m) => m && m.id === id) || null
  if (nfcRow?.archived || material?.archived_at) {
    return { available: false, reason: 'Позиция NFC-метки в архиве', price: null, material, stock: null }
  }
  if (!nfcRow && !material) {
    return { available: false, reason: 'Позиция NFC-метки не найдена на складе', price: null, material: null, stock: null }
  }
  const price = positive(nfcRow?.nfc_unit_price)
  if (price == null) return { available: false, reason: 'У NFC-метки нет цены на складе', price: null, material, stock: null }
  const stockRaw = Number(material?.stock_qty)
  return {
    available: true, reason: null, price, material,
    stock: Number.isFinite(stockRaw) ? stockRaw : null,
  }
}
