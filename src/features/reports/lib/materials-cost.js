// Расчёт фактической себестоимости материалов на заказ.
// Использует k24_materials.unit_cost (R8 серии 25.05 — weighted average
// от приходов) вместо жёстких прайс-листов MATERIAL_COSTS.

/**
 * Построить карту { material_code → unit_cost } из массива материалов.
 * Для БОПП и коробок (где material_code пустой) — отдельная map по type
 * с усреднением (фактическая ставка зависит от размера, в отчётах берём
 * среднюю по группе).
 */
export function buildCostMap(materials) {
  const byCode = {}        // {G: 245, M: 230, matte: 130, resin: 2.35, transfer: 232, ...}
  const avgByType = {}     // {packaging_bag: 0.7, box: 35} — среднее unit_cost по группе
  const sumByType = {}
  const cntByType = {}
  for (const m of materials || []) {
    if (m.material_code && Number(m.unit_cost) > 0) {
      byCode[m.material_code] = Number(m.unit_cost)
    }
    if (m.type && Number(m.unit_cost) > 0) {
      sumByType[m.type] = (sumByType[m.type] || 0) + Number(m.unit_cost)
      cntByType[m.type] = (cntByType[m.type] || 0) + 1
    }
  }
  for (const t of Object.keys(sumByType)) {
    avgByType[t] = sumByType[t] / cntByType[t]
  }
  return { byCode, avgByType }
}

/**
 * Себестоимость материалов для одного заказа.
 * @param {object} row — расширенный row из useOrdersCostReport: должен содержать
 *   actual_film / actual_lam (метры всего), actual_film_by_type,
 *   actual_lam_by_type (объекты code → метры), actual_resin (граммы), boxes_used,
 *   и (R20.2) джойны film_material / film_stickers_material / lam_material с unit_cost.
 *   R17.0: bopp_bags_used убрано — поле не пишется в k24_production_logs.
 * @param {object} costMap — результат buildCostMap.
 * @returns {{ film: number, lam: number, resin: number, box: number, total: number }}
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

  const resin = (Number(row.actual_resin) || 0) * (costMap.byCode.resin || 0)
  const box = (Number(row.boxes_used) || 0) * (costMap.avgByType.box || 0)
  return { film, lam, resin, box, total: film + lam + resin + box }
}
