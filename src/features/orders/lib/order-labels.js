// R25.4 (ТЗ 4.3 / 4.4): единые подписи ламинации, монтажной плёнки и правки
// макета для шапки заказа, тех-карты, производственной наклейки и образца.
// Чистые функции без React.
import { LAMINATION_TYPES, DESIGN_STATUSES } from '@/shared/constants'

/** Ламинация заказа: имя позиции склада → подпись типа → «Да»; без ламинации — null. */
export function laminationLabel(order) {
  if (!order?.need_lam) return null
  return order.lam_material?.name || LAMINATION_TYPES[order.lam_type]?.label || 'Да'
}

/**
 * Монтажная плёнка (отдельно от ламинации, ТЗ 4.3): имя позиции склада или
 * общая подпись. null — монтажная плёнка не нужна. Старые заказы с
 * lam_type='transfer' показывают её через laminationLabel (как раньше).
 */
export function montageLabel(order) {
  if (!order?.needs_montage_film) return null
  return order.montage_material?.name || 'Монтажная плёнка'
}

/** Одна строка «Ламинация / монтаж» для узких мест (тех-карта, наклейка). */
export function laminationSummary(order) {
  const lam = laminationLabel(order)
  const montage = montageLabel(order)
  if (lam && montage) return `${lam} + монтаж: ${montage}`
  if (montage) return `Монтаж: ${montage}`
  return lam || 'Нет'
}

/** Пометка «Требуется правка макета» (только для needs_edit), иначе null. */
export function designEditNote(order) {
  return order?.design_status === 'needs_edit' ? DESIGN_STATUSES.needs_edit.label : null
}

/**
 * R27.2 (ТЗ 19.11, №4.4): доп. материалы заказа (k24_order_materials с
 * категорией order_field='extra') для тех-карты и наклейки. Позиция с «NFC»
 * в названии подписывается «NFC-метка».
 * @param {Array<{ material?: {name?:string}, category?: {order_field?:string} }>} rows
 * @returns {Array<{ label:string, value:string, isNfc:boolean }>}
 */
export function extraMaterialLabels(rows) {
  return (rows || [])
    .filter((r) => r?.material?.name && (!r.category || r.category.order_field === 'extra'))
    .map((r) => {
      const name = String(r.material.name).trim()
      const isNfc = /nfc/i.test(name)
      return { label: isNfc ? 'NFC-метка' : 'Доп. материал', value: name, isNfc }
    })
}
