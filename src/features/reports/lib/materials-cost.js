// Расчёт фактической себестоимости материалов на заказ.
// Использует k24_materials.unit_cost (R8 серии 25.05 — weighted average
// от приходов) вместо жёстких прайс-листов MATERIAL_COSTS.

/**
 * Приоритет позиции при дубле material_code (несколько позиций склада с одним
 * кодом — например, Duckson и Orajet обе 'G'). Раньше побеждала последняя в
 * выдаче БД, т.е. цена плёнки «прыгала» между загрузками. Теперь выбор
 * детерминирован: (1) не архивная, (2) по имени (localeCompare 'ru'),
 * (3) по id. Позиции без unit_cost > 0 в карту не попадают вовсе.
 * Отрицательное значение — a приоритетнее b.
 */
export function compareCodeCandidates(a, b) {
  const archA = a.archived_at ? 1 : 0
  const archB = b.archived_at ? 1 : 0
  if (archA !== archB) return archA - archB
  const byName = String(a.name || '').localeCompare(String(b.name || ''), 'ru')
  if (byName !== 0) return byName
  return String(a.id || '').localeCompare(String(b.id || ''))
}

/**
 * Построить карту { material_code → unit_cost } из массива материалов.
 * Для БОПП и коробок (где material_code пустой) — отдельная map по type
 * с усреднением (фактическая ставка зависит от размера, в отчётах берём
 * среднюю по группе).
 *
 * Дубли material_code разрешаются compareCodeCandidates (см. выше) —
 * результат не зависит от порядка строк. unit_cost читается из
 * k24_materials_full (NULL без view:finance → карта пустая).
 */
export function buildCostMap(materials) {
  const byCode = {}        // {G: 245, M: 230, matte: 130, resin: 2.35, transfer: 232, ...}
  const avgByType = {}     // {packaging_bag: 0.7, box: 35} — среднее unit_cost по группе
  const sumByType = {}
  const cntByType = {}
  const winner = {}        // code → выбранная позиция
  for (const m of materials || []) {
    if (m.material_code && Number(m.unit_cost) > 0) {
      const cur = winner[m.material_code]
      if (!cur || compareCodeCandidates(m, cur) < 0) winner[m.material_code] = m
    }
    if (m.type && Number(m.unit_cost) > 0) {
      sumByType[m.type] = (sumByType[m.type] || 0) + Number(m.unit_cost)
      cntByType[m.type] = (cntByType[m.type] || 0) + 1
    }
  }
  for (const [code, m] of Object.entries(winner)) byCode[code] = Number(m.unit_cost)
  for (const t of Object.keys(sumByType)) {
    avgByType[t] = sumByType[t] / cntByType[t]
  }
  return { byCode, avgByType }
}

/**
 * Фактический расход материалов заказа из его production logs — в форме,
 * которую ждёт costForOrder (actual_film / actual_film_by_type / actual_lam /
 * actual_lam_by_type / actual_montage / actual_resin / boxes_used).
 * Единый источник для отчётов (useOrdersCostReport), аналитики и вкладки
 * «Финансы» заказа — все считают себестоимость по WAC одинаково.
 *
 * Код плёнки лога: l.film_type, иначе (R14.6: после R8 в логи не пишется)
 * из заказа — для stickerpack3D track='stickers' film_type_stickers, иначе
 * film_type. Поля заказа — из embed'а лога (l.order), недостающие — из аргумента.
 *
 * @param {Array} logs — логи ОДНОГО заказа
 * @param {object} [order] — { film_type, film_type_stickers, lam_type, order_type }
 */
export function aggregateMaterialUsage(logs, order = null) {
  const out = {
    actual_film: 0, actual_film_by_type: {}, actual_lam: 0, actual_lam_by_type: {},
    actual_montage: 0, actual_resin: 0, boxes_used: 0,
  }
  for (const l of logs || []) {
    // Поле-за-полем: embed лога может нести не все колонки (в аналитике —
    // только order_type и поля оплаты), недостающее берём из заказа.
    const pick = (k) => l.order?.[k] ?? order?.[k]
    const o = {
      order_type: pick('order_type'), film_type: pick('film_type'),
      film_type_stickers: pick('film_type_stickers'), lam_type: pick('lam_type'),
    }
    const filmM = Number(l.film_meters) || 0
    const lamM = Number(l.lamination_meters) || 0
    out.actual_film += filmM
    out.actual_lam += lamM
    out.actual_montage += Number(l.montage_meters) || 0
    out.actual_resin += Number(l.resin_grams) || 0
    out.boxes_used += Number(l.boxes_used) || 0
    const isPackStickerTrack = o.order_type === 'stickerpack3D' && l.track === 'stickers'
    const ft = l.film_type || (isPackStickerTrack ? o.film_type_stickers : o.film_type)
    if (ft && filmM > 0) out.actual_film_by_type[ft] = (out.actual_film_by_type[ft] || 0) + filmM
    if (o.lam_type && lamM > 0) out.actual_lam_by_type[o.lam_type] = (out.actual_lam_by_type[o.lam_type] || 0) + lamM
  }
  return out
}

/**
 * Дописать unit_cost в embed'ы позиций заказа (film_material и т.п.) из
 * списка k24_materials_full (unit_cost NULL без view:finance). Чистая
 * функция: возвращает новый объект заказа.
 * @param {object} order — с *_material_id и/или embed'ами
 * @param {Object<string, object>} materialsById — { id: { id, name, material_code, unit_cost } }
 */
export function withMaterialUnitCosts(order, materialsById) {
  const out = { ...order }
  for (const k of ['film_material', 'film_stickers_material', 'lam_material', 'montage_material']) {
    const id = order?.[k]?.id || order?.[`${k}_id`]
    const m = id ? materialsById?.[id] : null
    if (m) out[k] = { ...(order?.[k] || {}), id, name: order?.[k]?.name ?? m.name, material_code: order?.[k]?.material_code ?? m.material_code, unit_cost: m.unit_cost ?? null }
  }
  return out
}

/**
 * Себестоимость материалов для одного заказа.
 * @param {object} row — расширенный row из useOrdersCostReport: должен содержать
 *   actual_film / actual_lam (метры всего), actual_film_by_type,
 *   actual_lam_by_type (объекты code → метры), actual_resin (граммы), boxes_used,
 *   и (R20.2) джойны film_material / film_stickers_material / lam_material с unit_cost.
 *   R17.0: bopp_bags_used убрано — поле не пишется в k24_production_logs.
 * @param {object} costMap — результат buildCostMap.
 * @returns {{ film: number, lam: number, resin: number, box: number, extra: number, total: number, contractor: number }}
 *   R25.7B (ТЗ 7.5): extra — доп. материалы с отметкой «Учитывать в расходах»
 *   (row.extra_materials_cost из RPC order_extra_materials, NULL без
 *   view:finance → 0). Заказ без доп. материалов: extra = 0, total прежний.
 *   R25.4: lam включает монтажную плёнку (actual_montage × позиция заказа или
 *   код 'transfer'); contractor — стоимость работ подрядчика (contractor_cost),
 *   НЕ входит в total (total — материалы). Себестоимость = total + труд + contractor.
 *
 * R20.2 (бриф 3.07): приоритет — себестоимость КОНКРЕТНО выбранной позиции
 * склада (film_material_id / lam_material_id, R16.1). Фолбэк по material_code —
 * только для legacy-заказов без выбранной позиции: ходовые Orajet-позиции
 * вообще не имеют кода (метры оценивались в 0 ₽), а код 'G' указывает на другую
 * физическую позицию (Duckson) с чужой ценой.
 */
export function costForOrder(row, costMap) {
  const filmUnit = Number(row.film_material?.unit_cost) || 0
  const stickersUnit = Number(row.film_stickers_material?.unit_cost) || 0

  let film = 0
  const filmByType = Object.entries(row.actual_film_by_type || {})
  if (filmByType.length > 0) {
    // Метры разделены по кодам треков (для 3D-пака стикеры падают в
    // film_type_stickers). Каждый код ценится своей позицией: стикеры —
    // film_stickers_material, остальное — film_material; при отсутствии
    // выбранной позиции — legacy-фолбэк по material_code. Раньше при
    // выбранной только позиции фонов ВСЕ метры (включая плёнку стикеров
    // другого типа) умножались на unit_cost фонов (ревью 05.07).
    // Ограничение: при film_type_stickers === film_type метры двух треков
    // сливаются в один код — различить позиции невозможно, идём по film_material.
    const isStickersCode = (code) =>
      row.film_type_stickers && code === row.film_type_stickers && row.film_type_stickers !== row.film_type
    for (const [code, m] of filmByType) {
      const unit = isStickersCode(code)
        ? (stickersUnit > 0 ? stickersUnit : (costMap.byCode[code] || 0))
        : (filmUnit > 0 ? filmUnit : (costMap.byCode[code] || 0))
      film += (Number(m) || 0) * unit
    }
  } else if (filmUnit > 0) {
    // Нет разбивки по типам (легаси-агрегат) — все метры по выбранной позиции.
    film = (Number(row.actual_film) || 0) * filmUnit
  }

  let lam = 0
  const lamUnit = Number(row.lam_material?.unit_cost) || 0
  if (lamUnit > 0) {
    lam = (Number(row.actual_lam) || 0) * lamUnit
  } else {
    for (const [code, m] of Object.entries(row.actual_lam_by_type || {})) {
      lam += (Number(m) || 0) * (costMap.byCode[code] || 0)
    }
  }

  // R25.4 (ТЗ 4.3): монтажная плёнка — своя позиция склада (фолбэк — код transfer).
  const montageUnit = Number(row.montage_material?.unit_cost) || costMap.byCode.transfer || 0
  lam += (Number(row.actual_montage) || 0) * montageUnit

  const resin = (Number(row.actual_resin) || 0) * (costMap.byCode.resin || 0)
  const box = (Number(row.boxes_used) || 0) * (costMap.avgByType.box || 0)
  const extra = Number(row.extra_materials_cost) || 0
  const contractor = Number(row.contractor_cost) || 0
  return { film, lam, resin, box, extra, total: film + lam + resin + box + extra, contractor }
}

/**
 * R25.7B (ТЗ 7.5): строки RPC order_extra_materials → { [order_id]: { cost, items } }.
 * В себестоимость (cost) входят только списания с in_order_costs=true;
 * items — все доп. материалы заказа (для расшифровки), с флагом inCosts.
 */
export function summarizeExtraMaterials(rows) {
  const byOrder = {}
  for (const r of rows || []) {
    if (!r?.order_id) continue
    const acc = (byOrder[r.order_id] ||= { cost: 0, items: [] })
    const cost = r.cost == null ? null : Number(r.cost) || 0
    if (r.in_order_costs && cost != null) acc.cost += cost
    acc.items.push({
      materialId: r.material_id,
      name: r.material_name,
      category: r.category_name,
      unit: r.unit,
      qty: Number(r.qty) || 0,
      cost,
      inCosts: !!r.in_order_costs,
    })
  }
  return byOrder
}
