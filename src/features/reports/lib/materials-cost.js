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
 *   actual_film_by_type, actual_lam_by_type (объекты code → метры),
 *   actual_resin (граммы), bopp_bags_used, boxes_used.
 * @param {object} costMap — результат buildCostMap.
 * @returns {{ film: number, lam: number, resin: number, bopp: number, box: number, total: number }}
 */
export function costForOrder(row, costMap) {
  let film = 0
  for (const [code, m] of Object.entries(row.actual_film_by_type || {})) {
    film += (Number(m) || 0) * (costMap.byCode[code] || 0)
  }
  let lam = 0
  for (const [code, m] of Object.entries(row.actual_lam_by_type || {})) {
    lam += (Number(m) || 0) * (costMap.byCode[code] || 0)
  }
  const resin = (Number(row.actual_resin) || 0) * (costMap.byCode.resin || 0)
  const bopp = (Number(row.bopp_bags_used) || 0) * (costMap.avgByType.packaging_bag || 0)
  const box = (Number(row.boxes_used) || 0) * (costMap.avgByType.box || 0)
  return { film, lam, resin, bopp, box, total: film + lam + resin + bopp + box }
}
