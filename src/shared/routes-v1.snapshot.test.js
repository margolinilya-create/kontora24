// R25.1: эталон маршрутов версии 1 (заказы до релиза фазы 1).
// Снят с кода ДО изменения getOrderRoute/getReprintRoute — v1 обязан остаться
// побайтно прежним (ТЗ 17.11, «Версия маршрута»). route_version 1, undefined
// и null дают одинаковый результат.
import { describe, it, expect } from 'vitest'
import { getOrderRoute, getReprintRoute } from './constants'

const TYPES = ['sticker_cut', 'sticker_kiss', 'stickerpack', 'sticker3D', 'stickerpack3D', 'rect', 'big', undefined, 'unknown_type']
const FLAGS = []
for (const need_lam of [true, false]) {
  for (const design_status of ['provided', 'needs_development']) {
    for (const bopp_bag of [true, false]) {
      FLAGS.push({ need_lam, design_status, bopp_bag })
    }
  }
}

function v1Matrix(extra) {
  const out = {}
  for (const order_type of TYPES) {
    for (const f of FLAGS) {
      const order = { order_type, ...f, ...extra }
      const key = `${order_type}|lam=${f.need_lam}|${f.design_status}|bopp=${f.bopp_bag}`
      out[key] = { route: getOrderRoute(order), reprint: getReprintRoute(order) }
    }
  }
  return out
}

describe('R25.1: маршруты v1 не меняются', () => {
  it('route_version отсутствует — снапшот', () => {
    expect(v1Matrix({})).toMatchSnapshot()
  })

  it('route_version=1 и null совпадают с отсутствующим', () => {
    const base = v1Matrix({})
    expect(v1Matrix({ route_version: 1 })).toEqual(base)
    expect(v1Matrix({ route_version: null })).toEqual(base)
  })

  it('v1 игнорирует поля v2 (доставка, монтажная плёнка, оплата, субподряд)', () => {
    const base = v1Matrix({})
    expect(v1Matrix({ route_version: 1, delivery_type: 'delivery', needs_montage_film: true, payment_status: 'cash', is_subcontract: true })).toEqual(base)
  })

  it('getOrderRoute(null/undefined) — как раньше', () => {
    expect(getOrderRoute(null)).toMatchSnapshot()
    expect(getOrderRoute(undefined)).toMatchSnapshot()
  })
})
