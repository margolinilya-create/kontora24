// R25.6 (ТЗ 17.11, Фаза 6): «Создать заказ» из калькулятора — чистые функции.
//   mapCalcToOrder      — таблица 6.2: результат calculate() → значения формы заказа
//   buildCalcSnapshot   — снимок расчёта для k24_orders.calc_snapshot (6.3)
//   orderPricePerUnit   — price_per_unit заказа (из расчёта или пересчёт от цены)
//   calcPriceDiff       — «Цена изменена вручную» во вкладке «Финансы»
//   restoreCalcState    — «Открыть в калькуляторе»: снимок → состояние калькулятора
// Без React и Supabase.

import { OPTION_KEYS, clampManualHours } from './calc'
import { formatHours } from './copy-text'

// v1 — R25.6; v2 — R27 (ТЗ 19.11): цена материала по складу, NFC, ручные
// операции. restoreCalcState читает обе версии (заказы до релиза — v1).
export const CALC_SNAPSHOT_VERSION = 2

/** design / designEdit → design_status заказа (разработка важнее правки). */
export function designStatusFor(options = {}) {
  if (options.design) return 'needs_development'
  if (options.designEdit) return 'needs_edit'
  return 'provided'
}

/**
 * Таблица 6.2 ТЗ: результат calculate() → значения формы заказа.
 *
 * @param {Object} result — calculate(): { input, orderType, qty, totalRounded, … }
 * @param {Object} ctx
 * @param {Object|null} ctx.film — выбранная позиция плёнки склада { id, material_code }
 * @param {Object|null} ctx.lam  — выбранная позиция ламинации { id, material_code }
 * @param {Object|null} ctx.nfc  — позиция NFC-метки { id, category_id } (R27.2)
 * @returns {{ values: Object, variants: Array, prefilledKeys: string[],
 *             extraSelection: Object }}
 *   values — defaultValues формы (react-hook-form), variants — виды при N > 1
 *   (общий размер + свой тираж), prefilledKeys — поля с меткой «из расчёта»,
 *   extraSelection — доп. материалы заказа { [category_id]: material_id }
 *   (проп initialExtraSelection формы).
 */
export function mapCalcToOrder(result, { film = null, lam = null, nfc = null } = {}) {
  const input = result.input
  const o = input.options || {}
  const orderType = result.orderType
  const isPack = input.product === 'pack'

  const values = {
    order_type: orderType,
    // Стикер без 3D: резка задаёт тип (вырубной / на подложке); 3D стикер —
    // «как в расчёте»; у стикерпаков поштучной резки нет.
    needs_individual_cut: isPack ? false : !!o.cut,
    width_mm: input.widthMm,
    height_mm: input.heightMm,
    qty: result.qty,
    // Материал — та же позиция склада (всегда: иначе триггер списания уйдёт в
    // фолбэк по коду плёнки); film_type — код позиции, без кода (бумага и пр.)
    // — пусто (R27.2, ТЗ 4.3).
    film_material_id: film?.id || null,
    film_type: film?.material_code || null,
    // Ревью R25 (п.7): позиция без кода — фолбэк 'glossy', иначе форма
    // посчитала бы ламинацию выключенной и обнулила lam_material_id.
    lam_type: o.lamination && lam ? (lam.material_code || 'glossy') : '',
    lam_material_id: o.lamination && lam ? lam.id : null,
    // Монтажная плёнка: пустая позиция = «Позиция по умолчанию» (списание по коду transfer).
    needs_montage_film: !!o.montage,
    montage_material_id: null,
    is_urgent: !!o.urgent,
    // 3D стикерпак всегда упаковывается (в форме галочка закреплена).
    // NFC-метка bopp_bag НЕ ставит (R27.2): упаковка есть во всех v2-маршрутах,
    // а флаг включил бы сдельную оплату упаковки и списание БОПП-пакета.
    bopp_bag: !!o.bag || orderType === 'stickerpack3D',
    is_partner: !!o.partner,
    design_status: designStatusFor(o),
    price_final: result.totalRounded,
  }
  // R27.3: ручные операции — в примечание заказа (можно поправить до сохранения).
  const manual = (result.extras || []).find((e) => e.key === 'manual')
  if (o.manual && manual) values.notes = manualNote(manual.hours)

  const views = input.views || []
  const variants = views.length > 1
    ? views.map((q) => ({ width_mm: '', height_mm: '', qty: String(q) }))
    : []

  const prefilledKeys = [
    'order_type', 'width_mm', 'height_mm', 'qty',
    'film_material_id', 'lam_material_id', 'needs_montage_film',
    'is_urgent', 'bopp_bag', 'is_partner', 'design_status', 'price_final',
  ]
  if (!isPack) prefilledKeys.push('needs_individual_cut')
  if (variants.length > 1) prefilledKeys.push('variants')
  if (values.notes) prefilledKeys.push('notes')

  // R27.2: NFC-метка → доп. материал заказа (категория «Комплектующие»).
  const extraSelection = {}
  if (o.nfc && nfc?.id && nfc?.category_id) extraSelection[nfc.category_id] = nfc.id

  return { values, variants, prefilledKeys, extraSelection }
}

/** «Ручные операции по расчёту: 2 ч» — примечание заказа. */
export function manualNote(hours) {
  return `Ручные операции по расчёту: ${formatHours(hours)} ч`
}

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100

/**
 * Снимок расчёта (6.3): дата, кто считал, запись истории настроек, все входные
 * данные, цена за штуку, итого, себестоимость, наценка, текст «Скопировать подробно».
 */
export function buildCalcSnapshot(result, {
  film = null, lam = null, nfc = null, labels = {}, detailedText = '', author = null,
  settingsHistoryId = null, now = new Date(), materialPriceSource = null,
} = {}) {
  const manual = (result.extras || []).find((e) => e.key === 'manual')
  const opts = result.input.options || {}
  return {
    version: CALC_SNAPSHOT_VERSION,
    calculated_at: now.toISOString(),
    calculated_by: author ? { id: author.id || null, name: author.name || null } : null,
    settings_history_id: settingsHistoryId ?? null,
    input: {
      product: result.input.product,
      width_mm: result.input.widthMm,
      height_mm: result.input.heightMm,
      film_group: result.input.filmGroup,
      film_material_id: film?.id || null,
      film_name: labels.material || film?.name || null,
      lam_material_id: result.input.options?.lamination ? (lam?.id || null) : null,
      lam_name: result.input.options?.lamination ? (labels.lamination || lam?.name || null) : null,
      views: [...(result.input.views || [])],
      options: { ...opts },
      // v2 (R27): цена материала по складу (₽/см², без K) и её источник,
      // NFC-метка, ручные операции.
      material_price_cm2: result.input.materialPriceCm2 ?? null,
      material_price_source: materialPriceSource
        || (result.input.materialPriceCm2 != null ? 'warehouse' : 'group'),
      nfc_material_id: opts.nfc ? (nfc?.id || null) : null,
      nfc_price: opts.nfc ? (result.input.nfcPrice ?? null) : null,
      manual_hours: opts.manual && manual ? manual.hours : null,
      manual_rate: opts.manual && manual ? manual.rate : null,
    },
    product_label: result.productLabel,
    order_type: result.orderType,
    qty: result.qty,
    views_count: result.viewsCount,
    area_cm2: result.areaCm2,
    price_per_unit: result.pricePerUnit,
    price_per_unit_rounded: result.pricePerUnitRounded,
    total: result.total,
    total_rounded: result.totalRounded,
    extras: (result.extras || []).map((e) => ({ ...e })),
    extras_total: result.extrasTotal,
    cost_per_cm2: result.costPerCm2,
    cost_per_unit: result.costPerUnit,
    nfc_per_unit_delta: opts.nfc ? (result.nfcPerUnitDelta ?? null) : null,
    cost_total: result.costTotal,
    markup: result.markup,
    detailed_text: detailedText,
  }
}

/**
 * Цена за штуку заказа: если менеджер не трогал ни цену, ни тираж — цена из
 * расчёта (до копейки); иначе пересчёт от введённой стоимости.
 */
export function orderPricePerUnit(snapshot, priceFinal, qty) {
  const price = Number(priceFinal)
  const q = Number(qty)
  if (!Number.isFinite(price) || price <= 0) return null
  if (snapshot
    && Math.abs(price - Number(snapshot.total_rounded)) < 0.005
    && q === Number(snapshot.qty)) {
    return round2(snapshot.price_per_unit)
  }
  return q > 0 ? round2(price / q) : null
}

/**
 * Пометка «Цена изменена вручную»: стоимость заказа отличается от итога расчёта.
 * @returns {null | { calcTotal: number, orderTotal: number, diff: number }}
 */
export function calcPriceDiff(order) {
  const snap = order?.calc_snapshot
  if (!snap || snap.total_rounded == null) return null
  if (order.price_final == null || order.price_final === '') return null
  const orderTotal = Number(order.price_final)
  const calcTotal = Number(snap.total_rounded)
  if (!Number.isFinite(orderTotal) || !Number.isFinite(calcTotal)) return null
  const diff = orderTotal - calcTotal
  if (Math.abs(diff) < 0.5) return null
  return { calcTotal, orderTotal, diff }
}

/**
 * «Открыть в калькуляторе»: снимок → начальное состояние CalculatorPage.
 * Пересчёт идёт по ТЕКУЩИМ ставкам. Битый снимок → null (калькулятор с дефолтами).
 * Читает v1 (R25.6, без NFC/ручных операций — опции false, часы 1) и v2 (R27).
 */
export function restoreCalcState(snapshot) {
  const inp = snapshot?.input
  if (!inp || typeof inp !== 'object') return null
  const product = inp.product === 'pack' ? 'pack' : 'sticker'
  const views = Array.isArray(inp.views) && inp.views.length > 0
    ? inp.views.map((v) => Math.max(0, Math.floor(Number(v) || 0)))
    : null
  if (!views) return null
  const options = OPTION_KEYS.reduce((acc, k) => ({ ...acc, [k]: !!inp.options?.[k] }), {})
  if (product === 'pack') options.cut = false
  return {
    product,
    width: String(Math.floor(Number(inp.width_mm) || 0) || ''),
    height: String(Math.floor(Number(inp.height_mm) || 0) || ''),
    filmId: inp.film_material_id || null,
    lamId: inp.lam_material_id || null,
    views,
    options,
    manualHours: inp.manual_hours != null ? clampManualHours(inp.manual_hours) : null,
  }
}
