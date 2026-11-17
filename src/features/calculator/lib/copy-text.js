// R25.5 (ТЗ 5.4): два шаблона текста для клиента + копирование в буфер.
// Себестоимость и наценка в текст НЕ попадают никогда (даже при view:finance) —
// функции принимают только клиентские поля результата calculate().

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

/**
 * «Скопировать подробно» — всё из «Итога расчёта».
 * @param {Object} result — результат calculate()
 * @param {Object} labels — { material: «Название в расчёте», lamination: название или null }
 */
export function buildDetailedText(result, labels = {}) {
  const { input, qty, viewsCount } = result
  const views = input.views
  const lines = [
    'Расчёт стоимости — Контора',
    `Продукция: ${result.productLabel}`,
    `Материал: ${labels.material || '—'}`,
    `Ламинация: ${input.options.lamination ? (labels.lamination || 'да') : 'нет'}`,
  ]
  if (input.options.montage) lines.push('Монтажная плёнка: да')
  lines.push(`Размер: ${input.widthMm} × ${input.heightMm} мм (${formatArea(result.areaCm2)} см²)`)
  const tirage = viewsCount > 1
    ? `${formatInt(qty)} шт (${views.map((v, i) => `вид ${i + 1} — ${formatInt(v)} шт`).join(', ')})`
    : `${formatInt(qty)} шт`
  lines.push(`Тираж: ${tirage}`)
  lines.push(`Цена за 1 шт: ${formatPrice(result.pricePerUnit)}`)
  if (result.percentOptions.length > 0) {
    lines.push(`Опции: ${result.percentOptions.map((o) => `${o.label} ${o.text}`).join(', ')}`)
  }
  if (result.extras.length > 0) {
    lines.push('Доплаты:')
    for (const e of result.extras) {
      const amount = e.count ? `${e.count} × ${formatRub(e.unit)}` : formatRub(e.amount)
      lines.push(`• ${e.label}: ${amount}`)
    }
  }
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
