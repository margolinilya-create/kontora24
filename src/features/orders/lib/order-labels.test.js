import { describe, it, expect } from 'vitest'
import { laminationLabel, montageLabel, laminationSummary, designEditNote } from './order-labels'
import { formatOrderType } from '@/shared/lib/utils'

describe('R25.4 formatOrderType', () => {
  it('«Прочее» с названием показывает название', () => {
    expect(formatOrderType({ order_type: 'other', product_name: 'Магниты' })).toBe('Магниты')
  })
  it('«Прочее» без названия — «Прочее»', () => {
    expect(formatOrderType({ order_type: 'other', product_name: '  ' })).toBe('Прочее')
  })
  it('обычный тип игнорирует product_name', () => {
    expect(formatOrderType({ order_type: 'sticker3D', product_name: 'X' })).toBe('3D стикер')
  })
  it('строка трактуется как тип (совместимость)', () => {
    expect(formatOrderType('stickerpack')).toBe('Стикерпак')
    expect(formatOrderType('unknown')).toBe('unknown')
    expect(formatOrderType(null)).toBe('—')
  })
})

describe('R25.4 ламинация и монтажная плёнка', () => {
  it('глянец + монтажная (заказ №78) — обе опции', () => {
    const o = { need_lam: true, lam_type: 'glossy', needs_montage_film: true }
    expect(laminationLabel(o)).toBe('Глянцевая')
    expect(montageLabel(o)).toBe('Монтажная плёнка')
    expect(laminationSummary(o)).toBe('Глянцевая + монтаж: Монтажная плёнка')
  })
  it('позиции склада важнее кодов', () => {
    const o = { need_lam: true, lam_type: 'matte', lam_material: { name: 'Матовая X' }, needs_montage_film: true, montage_material: { name: 'Монтажная 1.26 м' } }
    expect(laminationSummary(o)).toBe('Матовая X + монтаж: Монтажная 1.26 м')
  })
  it('старый перенос (lam_type=transfer) читается как раньше', () => {
    expect(laminationSummary({ need_lam: true, lam_type: 'transfer' })).toBe('Монтажная плёнка 1.26 м')
  })
  it('только монтажная / ничего', () => {
    expect(laminationSummary({ needs_montage_film: true })).toBe('Монтаж: Монтажная плёнка')
    expect(laminationSummary({})).toBe('Нет')
  })
  it('правка макета', () => {
    expect(designEditNote({ design_status: 'needs_edit' })).toBe('Требуется правка макета')
    expect(designEditNote({ design_status: 'needs_development' })).toBeNull()
  })
})
