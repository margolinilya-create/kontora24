// R25.5 (ТЗ 5.4): два шаблона текста для клиента + копирование в буфер.
// Себестоимость и наценка в текст НЕ попадают никогда (даже при view:finance) —
// функции принимают только клиентские поля результата calculate().

import { DEFAULT_CALC_SETTINGS, normalizeSettings } from './calc'

/** «36 751» — разделитель тысяч обычным пробелом (текст уходит в мессенджеры). */
export function formatInt(v) {
  const n = Math.round(Number(v) || 0)
  const sign = n < 0 ? '−' : ''
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** «178,8» — один знак после запятой. */
export function formatDecimal1(v) {
  const n = Math.round((Number(v) || 0) * 10) / 10
  const [int, frac = '0'] = Math.abs(n).toFixed(1).split('.')
  return `${n < 0 ? '−' : ''}${formatInt(int)},${frac}`
}

export const formatRub = (v) => `${formatInt(v)} ₽`
export const formatPrice = (v) => `${formatDecimal1(v)} ₽`

/** «155,4», целые — без «,0». */
export function formatArea(v) {
  const s = formatDecimal1(v)
  return s.endsWith(',0') ? s.slice(0, -2) : s
}

/** «Скопировать»: тип, размер, тираж, итоговая цена. */
export function buildShortText(result) {
  const { input, qty, totalRounded, productLabel } = result
  return [
    `${productLabel} · ${input.widthMm}×${input.heightMm} мм · ${formatInt(qty)} шт`,
    `Итого: ${formatRub(totalRounded)}`,
  ].join('\n')
}

/** Линия-разделитель текста «подробно»: 20 знаков «—». */
export const TEXT_RULE = '—'.repeat(20)

/** «2», «1,5» — часы без лишних нулей. */
export function formatHours(v) {
  const n = Math.round((Number(v) || 0) * 10) / 10
  return String(n).replace('.', ',')
}

/** «30», «2,5» — процент/₽ из настроек без лишних нулей. */
function formatPlain(v) {
  return String(Math.round((Number(v) || 0) * 100) / 100).replace('.', ',')
}

/**
 * Строки блока «Дополнительно:» (ТЗ 19.11, таблица 1.2) — в порядке
 * переключателей калькулятора, доп. виды — последними. 3D и ламинация в
 * блоке не повторяются; себестоимость и наценка — никогда.
 * Опции в цене — процент / надбавка за штуку, фиксированные — сумма.
 * @param {Object} result — calculate()
 * @param {Object} settings — нормализованные настройки (проценты, ставки)
 * @returns {Array<{ key: string, label: string, text: string }>}
 */
export function buildOptionLines(result, settings) {
  const opts = result.input?.options || {}
  const o = settings?.options || {}
  const extra = (key) => (result.extras || []).find((e) => e.key === key)
  const lines = []
  const push = (key, label, text) => lines.push({ key, label, text })

  if (opts.montage && extra('montage')) push('montage', 'Монтажная плёнка', formatRub(extra('montage').amount))
  if (opts.urgent) push('urgent', 'Срочность', `+${formatPlain(o.urgent_pct)}%`)
  if (opts.bag) push('bag', 'Упаковка в пакетик', `+${formatPlain(o.bag_rub)} ₽/шт`)
  if (opts.partner) push('partner', 'Партнёрская скидка', `−${formatPlain(o.partner_pct)}%`)
  if (opts.cut) push('cut', 'Поштучная резка', `+${formatPlain(o.cut_pct)}%`)
  if (opts.nfc) push('nfc', 'NFC-метка', `+${formatDecimal1(result.nfcPerUnitDelta)} ₽/шт`)
  if (opts.design && extra('design')) push('design', 'Разработка макета', formatRub(extra('design').amount))
  if (opts.designEdit && extra('design_edit')) push('designEdit', 'Правка макета', formatRub(extra('design_edit').amount))
  const manual = extra('manual')
  if (opts.manual && manual) push('manual', 'Ручные операции', `${formatHours(manual.hours)} ч × ${formatRub(manual.rate)}`)
  const views = extra('extra_views')
  if (views) push('extra_views', 'Дополнительный вид', `${views.count} × ${formatRub(views.unit)}`)
  return lines
}

/**
 * «Скопировать подробно» (ТЗ 19.11, шаблон 1.1): две линии из 20 «—»,
 * блок «Дополнительно:» только при включённых опциях, «Итого» сразу под
 * нижней линией, пустых строк нет.
 * @param {Object} result — результат calculate()
 * @param {Object} labels — { material: «Название в расчёте», lamination: название или null }
 * @param {Object} [settings] — настройки калькулятора (проценты опций в тексте)
 */
export function buildDetailedText(result, labels = {}, settings = DEFAULT_CALC_SETTINGS) {
  const { input, qty, viewsCount } = result
  const views = input.views
  const lines = [
    'Расчёт стоимости — Контора',
    TEXT_RULE,
    `Продукция: ${result.productLabel}`,
    `Материал: ${labels.material || '—'}`,
    `Ламинация: ${input.options.lamination ? (labels.lamination || 'да') : 'нет'}`,
    `Размер: ${input.widthMm} × ${input.heightMm} мм (${formatArea(result.areaCm2)} см²)`,
  ]
  const tirage = viewsCount > 1
    ? `${formatInt(qty)} шт (${views.map((v, i) => `вид ${i + 1} — ${formatInt(v)} шт`).join(', ')})`
    : `${formatInt(qty)} шт`
  lines.push(`Тираж: ${tirage}`)
  lines.push(`Цена за 1 шт: ${formatPrice(result.pricePerUnit)}`)
  const extra = buildOptionLines(result, normalizeSettings(settings))
  if (extra.length > 0) {
    lines.push('Дополнительно:')
    for (const l of extra) lines.push(`• ${l.label}: ${l.text}`)
  }
  lines.push(TEXT_RULE)
  lines.push(`Итого: ${formatRub(result.totalRounded)}`)
  return lines.join('\n')
}

/**
 * Копирование в буфер: Clipboard API, для старых мобильных браузеров —
 * запасной способ через временное textarea + execCommand('copy').
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  try {
    if (globalThis.navigator?.clipboard?.writeText && globalThis.isSecureContext !== false) {
      await globalThis.navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // падаем в фолбэк ниже
  }
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '0'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  ta.setSelectionRange(0, text.length)
  let ok
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  return ok
}
