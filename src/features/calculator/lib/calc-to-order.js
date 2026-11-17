// R25.6 (ТЗ 17.11, Фаза 6): «Создать заказ» из калькулятора — чистые функции.
//   mapCalcToOrder      — таблица 6.2: результат calculate() → значения формы заказа
//   buildCalcSnapshot   — снимок расчёта для k24_orders.calc_snapshot (6.3)
//   orderPricePerUnit   — price_per_unit заказа (из расчёта или пересчёт от цены)
//   calcPriceDiff       — «Цена изменена вручную» во вкладке «Финансы»
//   restoreCalcState    — «Открыть в калькуляторе»: снимок → состояние калькулятора
// Без React и Supabase.

import { OPTION_KEYS } from './calc'

export const CALC_SNAPSHOT_VERSION = 1

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
 * @returns {{ values: Object, variants: Array, prefilledKeys: string[] }}
 *   values — defaultValues формы (react-hook-form), variants — виды при N > 1
 *   (общий размер + свой тираж), prefilledKeys — поля с меткой «из расчёта».
 */
export function mapCalcToOrder(result, { film = null, lam = null } = {}) {
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
    // Плёнка — та же позиция склада; film_type — код позиции (без кода форма
    // оставляет значение по умолчанию, как при ручном выборе такой позиции).
    film_material_id: film?.id || null,
    film_type: film?.material_code || 'G',
    // Ревью R25 (п.7): позиция без кода — фолбэк 'glossy', иначе форма
    // посчитала бы ламинацию выключенной и обнулила lam_material_id.
    lam_type: o.lamination && lam ? (lam.material_code || 'glossy') : '',
    lam_material_id: o.lamination && lam ? lam.id : null,
    // Монтажная плёнка: пустая позиция = «Позиция по умолчанию» (списание по коду transfer).
    needs_montage_film: !!o.montage,
    montage_material_id: null,
    is_urgent: !!o.urgent,
    // 3D стикерпак всегда упаковывается (в форме галочка закреплена).
    bopp_bag: !!o.bag || orderType === 'stickerpack3D',
    is_partner: !!o.partner,
    design_status: designStatusFor(o),
    price_final: result.totalRounded,
  }

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

  return { values, variants, prefilledKeys }
}

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100

/**
 * Снимок расчёта (6.3): дата, кто считал, запись истории настроек, все входные
 * данные, цена за штуку, итого, себестоимость, наценка, текст «Скопировать подробно».
 */
export function buildCalcSnapshot(result, {
  film = null, lam = null, labels = {}, detailedText = '', author = null,
  settingsHistoryId = null, now = new Date(),
} = {}) {
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
      options: { ...(result.input.options || {}) },
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
  }
}
