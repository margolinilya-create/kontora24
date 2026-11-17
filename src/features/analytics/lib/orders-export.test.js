import { describe, it, expect } from 'vitest'
import { buildOrdersFullAoa, ORDERS_FULL_COLUMNS } from './orders-export'

const orders = [{ id: 'o1', number: 7, price_final: 1000, cost_total: 400, payment_status: 'cash', film_type: 'G', qty: 10, status: 'done' }]
const logs = [{ order_id: 'o1', film_meters: 2, lamination_meters: 1, resin_grams: 50 }]
const FINANCE = ORDERS_FULL_COLUMNS.filter((c) => c.finance).map((c) => c.header)

describe('buildOrdersFullAoa', () => {
  it('без view:finance финансовых колонок нет совсем', () => {
    const [header, row] = buildOrdersFullAoa(orders, logs, { canFinance: false })
    for (const h of FINANCE) expect(header).not.toContain(h)
    expect(header).toContain('Факт. плёнка (м)')
    expect(row).toHaveLength(header.length)
    expect(row).not.toContain(1000)
  })

  it('с view:finance — цена, себестоимость, маржа, оплата', () => {
    const [header, row] = buildOrdersFullAoa(orders, logs, { canFinance: true })
    for (const h of ['Цена', 'Себестоимость', 'Маржа', 'Оплата', 'Себестоимость материалов (₽)']) {
      expect(header).toContain(h)
    }
    expect(row[header.indexOf('Маржа')]).toBe(600)
    expect(row[header.indexOf('Факт. плёнка (м)')]).toBe(2)
  })
})
