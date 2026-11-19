// R25.4 (ТЗ 4.6): виды изделий в форме заказа — до 9. У каждого вида размер
// (пусто = общий размер заказа) и тираж; тираж заказа = сумма тиражей видов.
// Чистые функции без React.

const EMPTY_VARIANT = { width_mm: '', height_mm: '', qty: '' }

/**
 * Подогнать массив видов под новое количество. При переходе с одного вида на
 * несколько первый вид получает текущий тираж заказа (чтобы не терять ввод).
 */
export function resizeVariants(prev, count, currentQty) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  if (n <= 1) return []
  const result = (prev || []).slice(0, n).map((v) => ({ ...v }))
  if (result.length === 0) {
    const q = Math.floor(Number(currentQty) || 0)
    result.push({ ...EMPTY_VARIANT, qty: q > 0 ? String(q) : '' })
  }
  while (result.length < n) result.push({ ...EMPTY_VARIANT })
  return result
}

/** Виды с разрешённым размером: пустая ширина/длина → общий размер заказа. */
export function buildVariantRows(variants, commonWidth, commonHeight) {
  const cw = Number(commonWidth) || 0
  const ch = Number(commonHeight) || 0
  return (variants || []).map((v, i) => {
    const ownW = Number(v.width_mm) || 0
    const ownH = Number(v.height_mm) || 0
    return {
      idx: i + 1,
      width_mm: ownW > 0 ? ownW : cw,
      height_mm: ownH > 0 ? ownH : ch,
      qty: Math.max(0, Math.floor(Number(v.qty) || 0)),
      customSize: ownW > 0 || ownH > 0,
    }
  })
}

export function variantsTotalQty(rows) {
  return (rows || []).reduce((sum, r) => sum + (Number(r.qty) || 0), 0)
}

// ── R27.0: правка видов в редакторе заказа (AdminOrderEditor) ─────────────
// Те же правила, что в RPC replace_order_items (миграция 110): номера видов
// с учётом работы не меняются — данные сотрудников не перенумеровываются.

export const MAX_EDITOR_VARIANTS = 9

/** Разделить тираж поровну на n видов (остаток — первым видам). */
export function splitQtyEvenly(total, n) {
  const count = Math.max(1, Math.floor(Number(n) || 1))
  const t = Math.max(0, Math.floor(Number(total) || 0))
  const base = Math.floor(t / count)
  const rest = t - base * count
  return Array.from({ length: count }, (_, i) => base + (i < rest ? 1 : 0))
}

/**
 * Строки редактора из k24_order_items. Размер, совпадающий с общим размером
 * заказа, показывается как «общий» (пустые поля). Если строк нет (старый
 * заказ) — один вид из полей заказа.
 * @returns {Array<{ src_idx:number|null, width_mm:string, height_mm:string, qty:string }>}
 */
export function itemsToEditorVariants(items, order) {
  const cw = Number(order?.width_mm) || 0
  const ch = Number(order?.height_mm) || 0
  const list = (items || []).slice().sort((a, b) => a.idx - b.idx)
  if (list.length === 0) {
    return [{ src_idx: null, width_mm: '', height_mm: '', qty: order?.qty != null ? String(order.qty) : '' }]
  }
  return list.map((it) => {
    const w = Number(it.width_mm) || 0
    const h = Number(it.height_mm) || 0
    const common = w === cw && h === ch
    return {
      src_idx: it.idx,
      width_mm: common ? '' : String(w),
      height_mm: common ? '' : String(h),
      qty: it.qty != null ? String(it.qty) : '',
    }
  })
}

/**
 * Изменить количество видов в редакторе. 1 → N: тираж делится поровну.
 * Новые виды — без исходного номера (src_idx = null), убираются последние.
 */
export function resizeEditorVariants(prev, count, totalQty) {
  const n = Math.max(1, Math.min(MAX_EDITOR_VARIANTS, Math.floor(Number(count) || 1)))
  const list = (prev || []).map((v) => ({ ...v }))
  if (n === list.length) return list
  if (n < list.length) return list.slice(0, n)
  if (list.length <= 1) {
    const total = (list.length === 1 ? Number(list[0].qty) : 0) || Number(totalQty) || 0
    const parts = splitQtyEvenly(total, n)
    const first = list[0] || { src_idx: null, width_mm: '', height_mm: '' }
    return parts.map((q, i) => (i === 0
      ? { ...first, qty: q > 0 ? String(q) : '' }
      : { src_idx: null, width_mm: '', height_mm: '', qty: q > 0 ? String(q) : '' }))
  }
  while (list.length < n) list.push({ src_idx: null, width_mm: '', height_mm: '', qty: '' })
  return list
}

/** Убрать вид по позиции (0-based). */
export function removeVariantAt(prev, index) {
  return (prev || []).filter((_, i) => i !== index)
}

/**
 * Номера видов с учётом работы: логи с item_idx (включая soft-deleted) и
 * допечатки с view_ref (кроме stickerpack3D — там view_ref = номер дизайна).
 */
export function accountingItemIdx(logs, reprints, orderType) {
  const set = new Set()
  for (const l of logs || []) {
    const k = Number(l?.item_idx)
    if (Number.isInteger(k) && k > 0) set.add(k)
  }
  if (orderType !== 'stickerpack3D') {
    for (const r of reprints || []) {
      const k = Number(r?.view_ref)
      if (Number.isInteger(k) && k > 0) set.add(k)
    }
  }
  return [...set].sort((a, b) => a - b)
}

/**
 * Проверка состава против учёта — зеркало RPC replace_order_items.
 * @param {Array<{src_idx:number|null}>} variants — новый состав по порядку
 * @param {number[]} accounting — номера видов с учётом
 * @param {number} currentCount — сколько видов сейчас в базе
 * @returns {string|null} текст ошибки или null
 */
export function checkVariantsAgainstAccounting(variants, accounting, currentCount) {
  const list = variants || []
  const used = new Set(list.map((v) => v.src_idx).filter((s) => s != null))
  let removedMin = null
  for (let k = 1; k <= currentCount; k++) {
    if (!used.has(k)) { removedMin = k; break }
  }
  for (const a of accounting || []) {
    if (a > currentCount) continue
    if (!used.has(a)) return `По виду ${a} есть учёт работы — его нельзя убрать.`
    const atPos = list[a - 1]
    if (!atPos || atPos.src_idx !== a) {
      if (removedMin != null) {
        return `Нельзя убрать вид ${removedMin}: по виду ${a} есть учёт работы — сначала уберите последние виды.`
      }
      return `По виду ${a} есть учёт работы — его номер нельзя менять.`
    }
  }
  return null
}

/** Можно ли убрать вид на позиции index: null или короткая причина. */
export function removeVariantBlockReason(variants, index, accounting, currentCount) {
  if ((variants || []).length <= 1) return 'В заказе должен остаться хотя бы один вид'
  const reason = checkVariantsAgainstAccounting(removeVariantAt(variants, index), accounting, currentCount)
  return reason ? 'По виду есть учёт работы' : null
}

/**
 * Данные для RPC: размер вида — свой или общий (явным числом), тираж — целое.
 * Если общий размер не задан — null (сервер подставит размер заказа).
 */
export function buildReplacePayload(variants, commonWidth, commonHeight) {
  const cw = Number(commonWidth) || 0
  const ch = Number(commonHeight) || 0
  return (variants || []).map((v) => {
    const w = Number(v.width_mm) || 0
    const h = Number(v.height_mm) || 0
    return {
      width_mm: w > 0 ? w : (cw > 0 ? cw : null),
      height_mm: h > 0 ? h : (ch > 0 ? ch : null),
      qty: Math.max(0, Math.floor(Number(v.qty) || 0)),
      src_idx: v.src_idx ?? null,
    }
  })
}

/** Отличается ли новый состав от текущих строк k24_order_items. */
export function variantsPayloadChanged(items, payload) {
  const cur = (items || []).slice().sort((a, b) => a.idx - b.idx)
  if (cur.length !== (payload || []).length) return true
  return payload.some((p, i) => {
    const c = cur[i]
    return p.src_idx !== c.idx
      || Number(p.width_mm) !== Number(c.width_mm)
      || Number(p.height_mm) !== Number(c.height_mm)
      || Number(p.qty) !== Number(c.qty)
  })
}

/** Первая ошибка заполнения или null. */
export function validateEditorVariants(payload) {
  for (let i = 0; i < (payload || []).length; i++) {
    const p = payload[i]
    if (!(p.qty >= 1)) return `Укажите тираж вида ${i + 1}`
    if (!(p.width_mm >= 1 && p.height_mm >= 1)) return `Укажите размер вида ${i + 1}`
  }
  return null
}

/** Сколько напечатано по каждому виду (item_idx → шт), без удалённых логов. */
export function printedByItemIdx(logs) {
  const map = {}
  for (const l of logs || []) {
    if (l?.deleted_at || l?.stage !== 'print') continue
    const k = Number(l.item_idx)
    if (!Number.isInteger(k) || k < 1) continue
    map[k] = (map[k] || 0) + (Number(l.stickers_printed) || 0)
  }
  return map
}

/**
 * «Кол-во видов» для тех-карты и PDF (R27.0 = TechCard): при нескольких
 * размерных видах — их число, иначе design_variants (у стикерпака это дизайны).
 */
export function variantsCountForDisplay(order, items) {
  const n = Array.isArray(items) ? items.length : 0
  return n > 1 ? n : (Number(order?.design_variants) || 1)
}

/** Тиражи видов заказа по порядку (k24_order_items → [qty]). */
export function itemsViewsQty(items) {
  return (items || []).slice().sort((a, b) => a.idx - b.idx)
    .map((it) => Math.max(0, Math.floor(Number(it.qty) || 0)))
}

/**
 * R27.0: виды изменены после расчёта — тиражи видов заказа не совпадают с
 * snapshot.input.views. Пока виды не загружены (пустой массив) — false.
 */
export function snapshotViewsChanged(snapshot, items) {
  const snapViews = Array.isArray(snapshot?.input?.views) ? snapshot.input.views : null
  const cur = itemsViewsQty(items)
  if (!snapViews || cur.length === 0) return false
  if (snapViews.length !== cur.length) return true
  return snapViews.some((v, i) => Math.floor(Number(v) || 0) !== cur[i])
}

/** Виды, у которых новый тираж меньше уже напечатанного: [{ position, printed, qty }]. */
export function variantsBelowPrinted(payload, printed) {
  const out = []
  ;(payload || []).forEach((p, i) => {
    if (p.src_idx == null) return
    const done = Number(printed?.[p.src_idx]) || 0
    if (done > 0 && p.qty < done) out.push({ position: i + 1, printed: done, qty: p.qty })
  })
  return out
}
