import { costForOrder } from './materials-cost'

/**
 * P&L (отчёты → вкладка «P&L») — единый источник для экрана и xlsx.
 *
 * Методика:
 *  • заказы — принятые в периоде (по дате приёма created_at);
 *  • отменённые (status='cancelled') в P&L не входят — выручки по ним нет,
 *    а раньше их price_final попадал в «Выручку»;
 *  • себестоимость = материалы (WAC, costForOrder) + сдельный труд
 *    (labor_cost) + подрядчик; расход/труд — по всем записям цеха заказа.
 *
 * Итоговая строка xlsx — суммы ТЕХ ЖЕ колонок, что на экране (раньше под
 * колонкой «Себестоимость» = материалы стоял итог материалы+труд+подрядчик,
 * и итоги файла не сходились с карточками на экране).
 *
 * @param {Array} orders — строки useOrdersCostReport
 * @param {object} costMap — buildCostMap
 * @returns {{ rows: Array, totals: object }}
 */
export function buildPnl(orders, costMap) {
  const rows = (orders || [])
    .filter((o) => o.status !== 'cancelled')
    .map((o) => {
      const mat = costForOrder(o, costMap)
      const revenue = Number(o.price_final) || 0
      const labor = Number(o.labor_cost) || 0
      const cost = mat.total + labor + mat.contractor
      const profit = revenue - cost
      return {
        ...o,
        revenue,
        mat_total: mat.total,
        labor,
        contractor: mat.contractor,
        cost,
        profit,
        margin_pct: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
      }
    })
  const totals = rows.reduce((acc, r) => {
    acc.revenue += r.revenue
    acc.mat += r.mat_total
    acc.labor += r.labor
    acc.contractor += r.contractor
    acc.cost += r.cost
    acc.profit += r.profit
    return acc
  }, { revenue: 0, mat: 0, labor: 0, contractor: 0, cost: 0, profit: 0 })
  totals.margin_pct = totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 100) : 0
  totals.count = rows.length
  totals.cancelledExcluded = (orders || []).length - rows.length
  return { rows, totals }
}

export const PNL_XLSX_HEADER = [
  '№ заказа', 'Клиент', 'Сумма заказа', 'Тип оплаты',
  'Себест. материалов', 'Оплата труда', 'Подрядчик', 'Затраты итого', 'Маржа ₽', 'Маржа %',
]

/**
 * AOA для xlsx. Итог — суммы колонок (округление построчно, как на экране).
 * @param {{ rows, totals }} pnl — buildPnl
 * @param {{ orderNumber: (o) => string, paymentLabel: (o) => string }} fmt
 */
export function buildPnlAoa({ rows, totals }, { orderNumber, paymentLabel }) {
  const aoa = [PNL_XLSX_HEADER]
  // Итог денежных колонок — сумма ровно тех (округлённых) чисел, что стоят в
  // строках файла: «автосумма» в Excel совпадёт с итоговой строкой.
  const sums = [0, 0, 0, 0, 0]
  for (const o of rows) {
    const money = [o.mat_total, o.labor, o.contractor, o.cost, o.profit].map((v) => Math.round(v))
    money.forEach((v, i) => { sums[i] += v })
    aoa.push([orderNumber(o), o.client_name || '—', o.revenue, paymentLabel(o), ...money, `${o.margin_pct}%`])
  }
  aoa.push([])
  aoa.push(['ИТОГО', '', totals.revenue, '', ...sums, `${totals.margin_pct}%`])
  return aoa
}
