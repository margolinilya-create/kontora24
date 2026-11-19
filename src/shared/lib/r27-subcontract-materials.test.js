import { describe, it, expect } from 'vitest'
import { formatSubcontractMaterials, formatOrderMaterial } from './utils'
import { getOrderRoute, ORDER_ROUTES_V2 } from '@/shared/constants'

describe('R27.1 субподряд: материалы у подрядчика', () => {
  it('материал · ламинация · монтажная плёнка', () => {
    expect(formatSubcontractMaterials({
      film_material: { name: 'Белая матовая' },
      need_lam: true, lam_type: 'glossy',
      needs_montage_film: true,
    })).toBe('Белая матовая · ламинация глянцевая · монтажная плёнка')
  })

  it('позиция ламинации со склада важнее кода; без ламинации — только материал', () => {
    expect(formatSubcontractMaterials({ film_type: 'M', need_lam: true, lam_type: 'matte', lam_material: { name: 'Orajet 3640 мат' } }))
      .toBe('Матовая (M) · ламинация Orajet 3640 мат')
    expect(formatSubcontractMaterials({ film_type: null, need_lam: false })).toBe('')
  })

  it('маршрут субподряда без печати и ламинации даже при need_lam', () => {
    const route = getOrderRoute({ route_version: 2, order_type: 'sticker_cut', is_subcontract: true, need_lam: true, lam_type: 'glossy' })
    expect(route).not.toContain('lamination')
    expect(route).not.toContain('print')
    expect(route).toContain('subcontract')
    // выключение субподряда возвращает «Ламинацию»
    const own = getOrderRoute({ route_version: 2, order_type: 'sticker_cut', is_subcontract: false, need_lam: true, lam_type: 'glossy' })
    expect(own).toContain('lamination')
  })
})

describe('R27.2 материал заказа и упаковка', () => {
  it('название позиции склада важнее кода film_type', () => {
    expect(formatOrderMaterial({ film_type: 'G', film_material: { name: 'Бумага Ситилайт' } })).toBe('Бумага Ситилайт')
    expect(formatOrderMaterial({ film_type: 'G' })).toBe('Глянцевая (G)')
    expect(formatOrderMaterial({ film_type: null })).toBe('')
  })

  it('в v2-маршруте каждого типа заказа есть «Упаковка» (без флага БОПП)', () => {
    for (const type of Object.keys(ORDER_ROUTES_V2)) {
      const route = getOrderRoute({ route_version: 2, order_type: type, bopp_bag: false, need_lam: false })
      expect(route, type).toContain('packaging')
    }
  })
})
