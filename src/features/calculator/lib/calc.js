// R25.5 (ТЗ 17.11, Фаза 5 + приложение А): чистая функция расчёта стоимости.
// Формулы перенесены из калькулятора портала ОП v2.0 без изменений:
//
//   S = W·H/100 (см²),  C = c·S
//   c = плёнка + краска + труд печати + аренда + налог [+ смола·k + заливка·k] [+ ламинация]
//   M = Mmax·(Mmin/Mmax)^t,  t = ln(q′/20)/ln(qmax/20),  q′ = min(max(q,20), qmax)
//   P = C·M·(1+u)·(1+r)·(1−p) + b
//   T = P·q + (N−1)·V + D + E + S·q·m
//
// Считается с полной точностью; округление только при показе (P — 0,1 ₽, T — 1 ₽).
// Без React и Supabase — легко тестируется и переиспользуется фазой 6
// («Создать заказ» маппит result.input / result.orderType в форму заказа).

export const MIN_QTY = 20
export const MAX_QTY = 20000
export const MAX_VIEWS = 9

export const PRODUCTS = {
  sticker: { label: 'Стикер', qmax: 3000 },
  pack: { label: 'Стикерпак', qmax: 2000 },
}

export const FILM_GROUPS = {
  white: { label: 'Белая / прозрачная', defaultName: 'Белая плёнка' },
  holo: { label: 'Голографическая', defaultName: 'Голографическая плёнка' },
  metal: { label: 'Металлизированная', defaultName: 'Металлизированная плёнка' },
}

// Значения по умолчанию — приложение А.3 (та же структура, что k24_settings['calculator']
// в миграции 100). Ставки ₽/см², наценки — множители, опции: % / ₽/шт / ₽.
export const DEFAULT_CALC_SETTINGS = Object.freeze({
  version: 1,
  film_prices: { white: 0.03, holo: 0.04, metal: 0.08 },
  ink: 0.01,
  labor_print: 0.03,
  labor_pour: 0.10,
  lamination: 0.03,
  montage: 0.03,
  vinyl: {
    rent: 0.01, tax: 0.02,
    markup_sticker_max: 4.0, markup_sticker_min: 1.5,
    markup_pack_max: 3.0, markup_pack_min: 1.6,
  },
  resin3d: {
    resin: 0.45, rent: 0.02, tax: 0.07,
    markup_sticker_max: 5.0, markup_sticker_min: 2.5,
    markup_pack_max: 3.0, markup_pack_min: 1.8,
  },
  options: {
    urgent_pct: 30, cut_pct: 15, partner_pct: 25,
    bag_rub: 3, extra_view_rub: 1000, design_rub: 5000, design_edit_rub: 3000,
  },
  default_film_id: null,
})

// Ступени таблицы «Цены по тиражам» (А.2). Цена считается на нижней границе.
export const TIERS_STICKER = [
  [20, 49], [50, 99], [100, 199], [200, 299], [300, 499], [500, 749], [750, 999],
  [1000, 1499], [1500, 1999], [2000, 2499], [2500, 2999], [3000, 4999],
  [5000, 9999], [10000, 20000],
]
// 12 ступеней с плато от 2 000 шт (qmax стикерпака). Точные границы TIERS_PACK
// портала в ТЗ не приведены — до 2 000 совпадают со стикером, дальше плато.
export const TIERS_PACK = [
  [20, 49], [50, 99], [100, 199], [200, 299], [300, 499], [500, 749], [750, 999],
  [1000, 1499], [1500, 1999], [2000, 4999], [5000, 9999], [10000, 20000],
]

export const OPTION_KEYS = [
  'resin3d', 'lamination', 'montage', 'urgent', 'bag', 'partner', 'cut', 'design', 'designEdit',
]

export const OPTION_LABELS = {
  resin3d: '3D заливка',
  lamination: 'Ламинация',
  montage: 'Монтажная плёнка',
  urgent: 'Срочность',
  bag: 'Упаковка в пакетик',
  partner: 'Партнёрский заказ',
  cut: 'Поштучная резка',
  design: 'Разработка макета',
  designEdit: 'Правка макета',
}

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

/** Глубокое слияние сохранённых настроек с дефолтами (недостающие ключи → А.3). */
export function normalizeSettings(raw) {
  const merge = (base, over) => {
    const out = {}
    for (const k of Object.keys(base)) {
      const b = base[k]
      const o = over?.[k]
      if (isObj(b)) out[k] = merge(b, isObj(o) ? o : {})
      else if (k === 'default_film_id') out[k] = o ?? null
      else out[k] = (o === '' || o == null || !Number.isFinite(Number(o))) ? b : Number(o)
    }
    return out
  }
  return merge(DEFAULT_CALC_SETTINGS, isObj(raw) ? raw : {})
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export function areaCm2(widthMm, heightMm) {
  return (num(widthMm) * num(heightMm)) / 100
}

/** Наценка по логарифмической кривой (А.2). */
export function markupFor(qty, qmax, mMax, mMin) {
  const q = Math.min(Math.max(num(qty), MIN_QTY), qmax)
  const t = Math.log(q / MIN_QTY) / Math.log(qmax / MIN_QTY)
  return mMax * Math.pow(mMin / mMax, t)
}

/**
 * Себестоимость 1 см² с разбивкой по статьям (А.1).
 * @returns {{ total: number, items: Array<{key, label, value}> }}
 */
export function costPerCm2({ product, filmGroup, resin3d, lamination }, settings) {
  const s = normalizeSettings(settings)
  const branch = resin3d ? s.resin3d : s.vinyl
  const items = [
    { key: 'film', label: 'Плёнка', value: num(s.film_prices[filmGroup] ?? s.film_prices.white) },
    { key: 'ink', label: 'Краска', value: s.ink },
    { key: 'labor_print', label: 'Труд — печать', value: s.labor_print },
  ]
  if (resin3d) {
    // 3D стикер: смола ×1,0 + заливка ×0,5; 3D стикерпак: смола ×0,5 + заливка ×1,0.
    const isPack = product === 'pack'
    items.push({ key: 'resin', label: 'Смола', value: s.resin3d.resin * (isPack ? 0.5 : 1.0) })
    items.push({ key: 'labor_pour', label: 'Труд — заливка', value: s.labor_pour * (isPack ? 1.0 : 0.5) })
  }
  items.push({ key: 'rent', label: 'Аренда + электричество', value: branch.rent })
  items.push({ key: 'tax', label: 'Налог', value: branch.tax })
  if (lamination) items.push({ key: 'lamination', label: 'Ламинация', value: s.lamination })
  const total = items.reduce((acc, i) => acc + i.value, 0)
  return { total, items }
}

/** Русское название продукции для текста клиенту и итога. */
export function productLabel({ product, resin3d, cut }) {
  if (product === 'pack') return resin3d ? '3D стикерпак' : 'Стикерпак'
  if (resin3d) return '3D стикер'
  return cut ? 'Стикер вырубной' : 'Стикер на подложке'
}

/** Тип заказа Контора24 (для фазы 6 «Создать заказ»). */
export function orderTypeFor({ product, resin3d, cut }) {
  if (product === 'pack') return resin3d ? 'stickerpack3D' : 'stickerpack'
  if (resin3d) return 'sticker3D'
  return cut ? 'sticker_cut' : 'sticker_kiss'
}

/** Тираж по видам: сумма. Пустые/битые значения = 0. */
export function sumViews(views) {
  return (views || []).reduce((acc, v) => acc + Math.max(0, Math.floor(num(v))), 0)
}

/** Деление тиража поровну при переходе с 1 вида на N: остаток — в вид 1. */
export function splitQty(total, n) {
  const count = Math.min(Math.max(1, Math.floor(num(n))), MAX_VIEWS)
  const q = Math.max(0, Math.floor(num(total)))
  const base = Math.floor(q / count)
  const out = Array.from({ length: count }, () => base)
  out[0] += q - base * count
  return out
}

/** Нормализация тиража на выходе из поля: < 20 → 20, > 20 000 → 20 000. */
export function clampQty(v) {
  const q = Math.floor(num(v))
  if (q < MIN_QTY) return MIN_QTY
  if (q > MAX_QTY) return MAX_QTY
  return q
}

/**
 * Основной расчёт.
 *
 * @param {Object} input
 * @param {'sticker'|'pack'} input.product
 * @param {number} input.widthMm
 * @param {number} input.heightMm
 * @param {'white'|'holo'|'metal'} input.filmGroup
 * @param {number[]} [input.views]  тираж по видам (N = длина; q = сумма)
 * @param {number}   [input.qty]    тираж, если views не передан (1 вид)
 * @param {Object}   [input.options] флаги OPTION_KEYS
 * @param {Object}   settings — k24_settings['calculator'] (нормализуется)
 */
export function calculate(input, settings) {
  const s = normalizeSettings(settings)
  const product = input.product === 'pack' ? 'pack' : 'sticker'
  const opts = { ...(input.options || {}) }
  // Поштучная резка — только у стикера (у стикерпака скрыта).
  if (product === 'pack') opts.cut = false

  const views = Array.isArray(input.views) && input.views.length > 0
    ? input.views.map((v) => Math.max(0, Math.floor(num(v))))
    : [Math.max(0, Math.floor(num(input.qty)))]
  const qty = sumViews(views)
  const viewsCount = views.length

  const S = areaCm2(input.widthMm, input.heightMm)
  const cost = costPerCm2({ product, filmGroup: input.filmGroup, resin3d: !!opts.resin3d, lamination: !!opts.lamination }, s)
  const C = cost.total * S

  const branch = opts.resin3d ? s.resin3d : s.vinyl
  const mMax = product === 'pack' ? branch.markup_pack_max : branch.markup_sticker_max
  const mMin = product === 'pack' ? branch.markup_pack_min : branch.markup_sticker_min
  const qmax = PRODUCTS[product].qmax
  const markup = markupFor(qty, qmax, mMax, mMin)

  const o = s.options
  const u = opts.urgent ? o.urgent_pct / 100 : 0
  const r = opts.cut ? o.cut_pct / 100 : 0
  const p = opts.partner ? o.partner_pct / 100 : 0
  const b = opts.bag ? o.bag_rub : 0

  const pricePerUnit = C * markup * (1 + u) * (1 + r) * (1 - p) + b

  const extras = []
  if (viewsCount > 1) {
    extras.push({ key: 'extra_views', label: 'Дополнительный вид', count: viewsCount - 1, unit: o.extra_view_rub, amount: (viewsCount - 1) * o.extra_view_rub })
  }
  if (opts.design) extras.push({ key: 'design', label: 'Разработка макета', amount: o.design_rub })
  if (opts.designEdit) extras.push({ key: 'design_edit', label: 'Правка макета', amount: o.design_edit_rub })
  if (opts.montage) extras.push({ key: 'montage', label: 'Монтажная плёнка', amount: S * qty * s.montage })
  const extrasTotal = extras.reduce((acc, e) => acc + e.amount, 0)

  const total = pricePerUnit * qty + extrasTotal
  const costTotal = C * qty

  return {
    input: {
      product,
      widthMm: num(input.widthMm),
      heightMm: num(input.heightMm),
      filmGroup: input.filmGroup,
      views,
      options: OPTION_KEYS.reduce((acc, k) => ({ ...acc, [k]: !!opts[k] }), {}),
    },
    productLabel: productLabel({ product, resin3d: !!opts.resin3d, cut: !!opts.cut }),
    orderType: orderTypeFor({ product, resin3d: !!opts.resin3d, cut: !!opts.cut }),
    areaCm2: S,
    qty,
    viewsCount,
    tirageAreaM2: (S * qty) / 10000,
    costPerCm2: cost.total,
    costBreakdown: cost.items,
    costPerUnit: C,
    costTotal,
    markup,
    pricePerUnit,
    pricePerUnitRounded: roundPrice(pricePerUnit),
    extras,
    extrasTotal,
    total,
    totalRounded: Math.round(total),
    // Опции для текста клиенту: процентные — с процентом, упаковка — ₽/шт.
    percentOptions: [
      opts.urgent && { key: 'urgent', label: 'Срочность', text: `+${fmtPct(o.urgent_pct)}%` },
      opts.cut && { key: 'cut', label: 'Поштучная резка', text: `+${fmtPct(o.cut_pct)}%` },
      opts.partner && { key: 'partner', label: 'Партнёрская скидка', text: `−${fmtPct(o.partner_pct)}%` },
      opts.bag && { key: 'bag', label: 'Упаковка в пакетик', text: `+${fmtPct(o.bag_rub)} ₽/шт` },
    ].filter(Boolean),
  }
}

function fmtPct(v) {
  return String(v).replace('.', ',')
}

export function roundPrice(v) {
  return Math.round(v * 10) / 10
}

/**
 * Чип у опции: T с опцией − T без неё при остальных опциях как сейчас (А.2).
 * @returns {Object<string, number>} key → дельта итого (₽, полная точность)
 */
export function optionDeltas(input, settings) {
  const out = {}
  for (const key of OPTION_KEYS) {
    const base = input.options || {}
    const on = calculate({ ...input, options: { ...base, [key]: true } }, settings).total
    const off = calculate({ ...input, options: { ...base, [key]: false } }, settings).total
    out[key] = on - off
  }
  return out
}

/**
 * Таблица «Цены по тиражам»: цена на нижней границе каждой ступени с учётом
 * включённых опций и текущего числа видов. current — ступень текущего тиража.
 */
export function priceTiers(input, settings) {
  const product = input.product === 'pack' ? 'pack' : 'sticker'
  const tiers = product === 'pack' ? TIERS_PACK : TIERS_STICKER
  const viewsCount = Array.isArray(input.views) && input.views.length > 0 ? input.views.length : 1
  const currentQty = Array.isArray(input.views) && input.views.length > 0 ? sumViews(input.views) : Math.floor(num(input.qty))
  return tiers.map(([from, to]) => {
    // Ступень считаем на нижней границе; число видов сохраняем (доплаты за виды).
    const views = splitQty(from, viewsCount)
    const r = calculate({ ...input, views }, settings)
    return {
      from,
      to,
      markup: r.markup,
      pricePerUnit: r.pricePerUnit,
      total: r.total,
      current: currentQty >= from && currentQty <= to,
    }
  })
}

// ---------------------------------------------------------------------------
// Валидация настроек (5.5): все числа ≥ 0; ставки ₽/см² — не больше двух знаков
// после запятой; минимальная наценка не больше максимальной.
// ---------------------------------------------------------------------------
export const RATE_PATHS = [
  'film_prices.white', 'film_prices.holo', 'film_prices.metal',
  'ink', 'labor_print', 'labor_pour', 'lamination', 'montage',
  'vinyl.rent', 'vinyl.tax',
  'resin3d.resin', 'resin3d.rent', 'resin3d.tax',
]
export const NUMBER_PATHS = [
  ...RATE_PATHS,
  'vinyl.markup_sticker_max', 'vinyl.markup_sticker_min', 'vinyl.markup_pack_max', 'vinyl.markup_pack_min',
  'resin3d.markup_sticker_max', 'resin3d.markup_sticker_min', 'resin3d.markup_pack_max', 'resin3d.markup_pack_min',
  'options.urgent_pct', 'options.cut_pct', 'options.partner_pct', 'options.bag_rub',
  'options.extra_view_rub', 'options.design_rub', 'options.design_edit_rub',
]

export function getPath(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

export function setPath(obj, path, value) {
  const keys = path.split('.')
  const out = { ...obj }
  let cur = out
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...(cur[keys[i]] || {}) }
    cur = cur[keys[i]]
  }
  cur[keys[keys.length - 1]] = value
  return out
}

/** @returns {Object<string,string>} path → сообщение об ошибке (пусто = ок). */
export function validateCalcSettings(settings) {
  const errors = {}
  for (const path of NUMBER_PATHS) {
    const raw = getPath(settings, path)
    const v = Number(raw)
    if (raw === '' || raw == null || !Number.isFinite(v)) { errors[path] = 'Введите число'; continue }
    if (v < 0) { errors[path] = 'Не меньше 0'; continue }
    if (RATE_PATHS.includes(path) && Math.abs(v * 100 - Math.round(v * 100)) > 1e-9) {
      errors[path] = 'Не больше двух знаков после запятой'
    }
  }
  for (const branch of ['vinyl', 'resin3d']) {
    for (const kind of ['sticker', 'pack']) {
      const max = Number(getPath(settings, `${branch}.markup_${kind}_max`))
      const min = Number(getPath(settings, `${branch}.markup_${kind}_min`))
      const minPath = `${branch}.markup_${kind}_min`
      if (!errors[minPath] && Number.isFinite(max) && Number.isFinite(min) && min > max) {
        errors[minPath] = 'Минимальная наценка больше максимальной'
      }
    }
  }
  return errors
}
