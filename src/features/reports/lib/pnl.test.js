import { describe, it, expect } from 'vitest'
import { buildPnl, buildPnlAoa, PNL_XLSX_HEADER } from './pnl'
import { buildCostMap } from './materials-cost'

const costMap = buildCostMap([{ material_code: 'G', type: 'film', unit_cost: 100 }])
const order = (o) => ({ actual_film_by_type: {}, labor_cost: 0, contractor_cost: 0, ...o })

describe('buildPnl', () => {
  const data = [
    order({ id: 'a', status: 'done', price_final: 1000, actual_film_by_type: { G: 2 }, labor_cost: 50, contractor_cost: 100 }),
    order({ id: 'b', status: 'print', price_final: 500, labor_cost: 10 }),
    order({ id: 'c', status: 'cancelled', price_final: 9999, labor_cost: 1 }),
  ]

  it('исключает отменённые заказы', () => {
    const { rows, totals } = buildPnl(data, costMap)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(totals.revenue).toBe(1500)
    expect(totals.cancelledExcluded).toBe(1)
  })

  it('затраты = материалы + труд + подрядчик; итоги — суммы колонок', () => {
    const { rows, totals } = buildPnl(data, costMap)
    expect(rows[0]).toMatchObject({ mat_total: 200, labor: 50, contractor: 100, cost: 350, profit: 650, margin_pct: 65 })
    expect(totals).toMatchObject({ mat: 200, labor: 60, contractor: 100, cost: 360, profit: 1140 })
    expect(totals.margin_pct).toBe(76)
  })

  it('итоговая строка xlsx совпадает с экранными итогами по каждой колонке', () => {
    const pnl = buildPnl(data, costMap)
    const aoa = buildPnlAoa(pnl, { orderNumber: (o) => o.id, paymentLabel: () => '' })
    expect(aoa[0]).toEqual(PNL_XLSX_HEADER)
    const total = aoa[aoa.length - 1]
    const col = (name) => PNL_XLSX_HEADER.indexOf(name)
    expect(total[col('Сумма заказа')]).toBe(pnl.totals.revenue)
    expect(total[col('Себест. материалов')]).toBe(200)
    expect(total[col('Оплата труда')]).toBe(60)
    expect(total[col('Затраты итого')]).toBe(Math.round(pnl.totals.cost))
    expect(total[col('Маржа ₽')]).toBe(Math.round(pnl.totals.profit))
    // Сумма построчных значений = итог (одна и та же колонка).
    const body = aoa.slice(1, -2)
    const sumCol = (name) => body.reduce((s, r) => s + r[col(name)], 0)
    expect(sumCol('Затраты итого')).toBe(total[col('Затраты итого')])
    expect(sumCol('Себест. материалов')).toBe(total[col('Себест. материалов')])
  })
})
