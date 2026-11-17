import { describe, it, expect } from 'vitest'
import { resizeVariants, buildVariantRows, variantsTotalQty } from './order-variants'
import { MAX_ORDER_ITEMS, orderTypeForIndividualCut, individualCutForOrderType, isIndividualCutHidden } from '@/shared/constants'

describe('R25.4 виды изделий (до 9)', () => {
  it('максимум — 9 видов', () => {
    expect(MAX_ORDER_ITEMS).toBe(9)
    expect(resizeVariants([], 9, 100)).toHaveLength(9)
  })

  it('первый вид получает текущий тираж, один вид — пустой массив', () => {
    expect(resizeVariants([], 3, 250)[0].qty).toBe('250')
    expect(resizeVariants([{ qty: '5' }], 1, 0)).toEqual([])
  })

  it('уменьшение сохраняет введённое', () => {
    const v = [{ width_mm: '10', height_mm: '', qty: '1' }, { width_mm: '', height_mm: '', qty: '2' }, { qty: '3' }]
    expect(resizeVariants(v, 2).map((x) => x.qty)).toEqual(['1', '2'])
  })

  it('пустой размер = общий; сумма тиражей = тираж заказа', () => {
    const rows = buildVariantRows([
      { width_mm: '', height_mm: '', qty: '100' },
      { width_mm: '50', height_mm: '70', qty: '40' },
      { width_mm: '', height_mm: '', qty: '' },
    ], 100, 120)
    expect(rows[0]).toMatchObject({ idx: 1, width_mm: 100, height_mm: 120, qty: 100, customSize: false })
    expect(rows[1]).toMatchObject({ width_mm: 50, height_mm: 70, customSize: true })
    expect(variantsTotalQty(rows)).toBe(140)
  })
})

describe('R25.4 поштучная резка ↔ тип', () => {
  it('виниловый стикер: галочка переключает тип и наоборот', () => {
    expect(orderTypeForIndividualCut('sticker_kiss', true)).toBe('sticker_cut')
    expect(orderTypeForIndividualCut('sticker_cut', false)).toBe('sticker_kiss')
    expect(individualCutForOrderType('sticker_cut')).toBe(true)
    expect(individualCutForOrderType('sticker_kiss')).toBe(false)
  })
  it('3D-стикер — независимая галочка, стикерпаки — скрыта', () => {
    expect(orderTypeForIndividualCut('sticker3D', true)).toBe('sticker3D')
    expect(individualCutForOrderType('sticker3D')).toBeNull()
    expect(isIndividualCutHidden('stickerpack3D')).toBe(true)
    expect(individualCutForOrderType('stickerpack')).toBe(false)
  })
})
