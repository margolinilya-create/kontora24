import { describe, it, expect } from 'vitest'
import {
  splitQtyEvenly, itemsToEditorVariants, resizeEditorVariants, removeVariantAt,
  accountingItemIdx, checkVariantsAgainstAccounting, removeVariantBlockReason,
  buildReplacePayload, variantsPayloadChanged, validateEditorVariants,
  printedByItemIdx, variantsBelowPrinted, variantsCountForDisplay, snapshotViewsChanged,
} from './order-variants'

const ORDER = { width_mm: 50, height_mm: 50, qty: 100 }
const ITEMS = [
  { idx: 1, width_mm: 50, height_mm: 50, qty: 50 },
  { idx: 2, width_mm: 40, height_mm: 40, qty: 30 },
  { idx: 3, width_mm: 50, height_mm: 50, qty: 20 },
]

describe('R27.0 редактор видов', () => {
  it('тираж делится поровну, остаток — первым видам', () => {
    expect(splitQtyEvenly(100, 3)).toEqual([34, 33, 33])
    expect(splitQtyEvenly(10, 1)).toEqual([10])
  })

  it('строки из k24_order_items: общий размер — пустые поля', () => {
    const v = itemsToEditorVariants(ITEMS, ORDER)
    expect(v[0]).toEqual({ src_idx: 1, width_mm: '', height_mm: '', qty: '50' })
    expect(v[1]).toEqual({ src_idx: 2, width_mm: '40', height_mm: '40', qty: '30' })
  })

  it('старый заказ без строк — один вид из полей заказа', () => {
    expect(itemsToEditorVariants([], ORDER)).toEqual([{ src_idx: null, width_mm: '', height_mm: '', qty: '100' }])
  })

  it('1 → 3: тираж делится поровну, новые виды без исходного номера', () => {
    const v = resizeEditorVariants([{ src_idx: 1, width_mm: '', height_mm: '', qty: '100' }], 3, 100)
    expect(v.map((x) => x.qty)).toEqual(['34', '33', '33'])
    expect(v.map((x) => x.src_idx)).toEqual([1, null, null])
  })

  it('уменьшение убирает последние виды', () => {
    const v = resizeEditorVariants(itemsToEditorVariants(ITEMS, ORDER), 2)
    expect(v.map((x) => x.src_idx)).toEqual([1, 2])
  })

  it('учёт: логи (в т.ч. удалённые) и допечатки; у 3D-пака view_ref не считается', () => {
    const logs = [{ item_idx: 2, deleted_at: '2026-11-01' }, { item_idx: null }]
    const reprints = [{ view_ref: 3 }]
    expect(accountingItemIdx(logs, reprints, 'sticker_cut')).toEqual([2, 3])
    expect(accountingItemIdx(logs, reprints, 'stickerpack3D')).toEqual([2])
  })

  it('удаление только без учёта у вида и видов после него', () => {
    const v = itemsToEditorVariants(ITEMS, ORDER)
    // учёт по виду 2: убрать вид 3 можно, вид 2 и вид 1 — нет
    expect(removeVariantBlockReason(v, 2, [2], 3)).toBeNull()
    expect(removeVariantBlockReason(v, 1, [2], 3)).toBe('По виду есть учёт работы')
    expect(removeVariantBlockReason(v, 0, [2], 3)).toBe('По виду есть учёт работы')
    // без учёта — вид можно убрать из середины
    expect(removeVariantBlockReason(v, 1, [], 3)).toBeNull()
    // последний оставшийся вид не убирается
    expect(removeVariantBlockReason([v[0]], 0, [], 1)).not.toBeNull()
  })

  it('тексты ошибок совпадают с RPC', () => {
    const v = itemsToEditorVariants(ITEMS, ORDER)
    expect(checkVariantsAgainstAccounting(removeVariantAt(v, 1), [2], 3))
      .toBe('По виду 2 есть учёт работы — его нельзя убрать.')
    expect(checkVariantsAgainstAccounting(removeVariantAt(v, 0), [2], 3))
      .toBe('Нельзя убрать вид 1: по виду 2 есть учёт работы — сначала уберите последние виды.')
    expect(checkVariantsAgainstAccounting(v, [2], 3)).toBeNull()
    // учёт по номеру, которого нет среди видов, не мешает
    expect(checkVariantsAgainstAccounting([v[0]], [5], 3)).toBeNull()
  })

  it('данные для RPC: общий размер подставляется числом', () => {
    const p = buildReplacePayload(itemsToEditorVariants(ITEMS, ORDER), 50, 50)
    expect(p[0]).toEqual({ width_mm: 50, height_mm: 50, qty: 50, src_idx: 1 })
    expect(p[1]).toEqual({ width_mm: 40, height_mm: 40, qty: 30, src_idx: 2 })
    expect(variantsPayloadChanged(ITEMS, p)).toBe(false)
    expect(variantsPayloadChanged(ITEMS, p.slice(0, 2))).toBe(true)
  })

  it('валидация заполнения', () => {
    expect(validateEditorVariants([{ width_mm: 1, height_mm: 1, qty: 0 }])).toBe('Укажите тираж вида 1')
    expect(validateEditorVariants([{ width_mm: null, height_mm: 1, qty: 1 }])).toBe('Укажите размер вида 1')
    expect(validateEditorVariants([{ width_mm: 1, height_mm: 1, qty: 1 }])).toBeNull()
  })

  it('тираж ниже напечатанного', () => {
    const printed = printedByItemIdx([
      { stage: 'print', item_idx: 1, stickers_printed: 40 },
      { stage: 'print', item_idx: 1, stickers_printed: 20, deleted_at: 'x' },
      { stage: 'cutting', item_idx: 1, stickers_printed: 99 },
    ])
    expect(printed).toEqual({ 1: 40 })
    expect(variantsBelowPrinted([{ src_idx: 1, qty: 30 }, { src_idx: null, qty: 1 }], printed))
      .toEqual([{ position: 1, printed: 40, qty: 30 }])
  })

  it('«Кол-во видов» в PDF как в тех-карте (№302: 2 вида при design_variants=1)', () => {
    expect(variantsCountForDisplay({ design_variants: 1 }, [{ idx: 1 }, { idx: 2 }])).toBe(2)
    expect(variantsCountForDisplay({ design_variants: 10 }, [{ idx: 1 }])).toBe(10)
    expect(variantsCountForDisplay({ design_variants: null }, [])).toBe(1)
  })

  it('виды изменены после расчёта', () => {
    const snap = { input: { views: [100, 200] } }
    expect(snapshotViewsChanged(snap, [{ idx: 2, qty: 200 }, { idx: 1, qty: 100 }])).toBe(false)
    expect(snapshotViewsChanged(snap, [{ idx: 1, qty: 300 }])).toBe(true)
    expect(snapshotViewsChanged(snap, [])).toBe(false)
  })
})
