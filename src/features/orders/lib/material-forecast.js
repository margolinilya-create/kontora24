// Предварительный расчёт расхода материалов для формы создания заказа
// (R8.1, бриф 25.05). Формулы взяты из брифа — см. блок «Формулы расчета».
//
// Чистые функции без React, тестируемые отдельно. Расход возвращается
// в единицах материала (метры для плёнки/ламинации, граммы для смолы,
// штуки для БОПП-пакетов и коробок).

import { FILM_TYPES, LAMINATION_TYPES, needsLamination } from '@/shared/constants'

// Ширина печатного блока по типу плёнки (мм) — из брифа.
const PRINT_BLOCK_WIDTH_MM = {
  G: 1230,             // Белая глянцевая
  M: 1230,             // Белая матовая
  Transparent_G: 1230, // Прозрачная глянцевая
  Transparent_M: 1230, // Прозрачная матовая
  Holo: 1220,          // Голографическая
  Gold: 970,           // Oracal 352 Золото
  Chrome: 970,         // Oracal 352 Серебро
}
const PRINT_BLOCK_FALLBACK_MM = 1230

const LAM_BLOCK_WIDTH_MM = 1230
const HEIGHT_MARGIN_MM = 30 // Технический отступ в высоту
const GAP_MM = 6            // Отступ между изделиями на печатном блоке
const RESIN_G_PER_CM2 = 0.1444 // 0,1444444444 г / см² из брифа
const PACK_FILL_AVG = 0.6   // Коэф. заполняемости стикерпака (средний)
const PACK_INNER_MARGIN_MM = 8 // S ≈ (W − 8) × (H − 8) из брифа

export function getPrintBlockWidth(filmType) {
  return PRINT_BLOCK_WIDTH_MM[filmType] ?? PRINT_BLOCK_FALLBACK_MM
}

/**
 * Расход плёнки в погонных метрах на тираж.
 * Формула брифа:
 *   itemsPerRow = floor(block_width / (item_width + gap))
 *   rows        = ceil(qty / itemsPerRow)
 *   meters      = rows * (item_height + height_margin) / 1000
 */
export function computeFilmMeters({ widthMm, heightMm, qty, blockWidthMm = PRINT_BLOCK_FALLBACK_MM }) {
  const w = Number(widthMm) || 0
  const h = Number(heightMm) || 0
  const q = Math.floor(Number(qty) || 0)
  if (!w || !h || !q) return 0
  const itemsPerRow = Math.max(1, Math.floor(blockWidthMm / (w + GAP_MM)))
  const rows = Math.ceil(q / itemsPerRow)
  return (rows * (h + HEIGHT_MARGIN_MM)) / 1000
}

export function computeLamMeters({ widthMm, heightMm, qty }) {
  return computeFilmMeters({ widthMm, heightMm, qty, blockWidthMm: LAM_BLOCK_WIDTH_MM })
}

/**
 * Расход смолы в граммах.
 * - sticker3D: вся площадь стикера × тираж × 0.1444
 * - stickerpack3D: эффективная площадь стикерпака (S ≈ (W−8)(H−8) × 0.6) × тираж × 0.1444
 */
export function computeResinGrams({ orderType, widthMm, heightMm, qty }) {
  const w = Number(widthMm) || 0
  const h = Number(heightMm) || 0
  const q = Math.floor(Number(qty) || 0)
  if (!w || !h || !q) return 0
  if (orderType === 'sticker3D') {
    const areaCm2 = (w * h) / 100
    return areaCm2 * RESIN_G_PER_CM2 * q
  }
  if (orderType === 'stickerpack3D') {
    const innerW = Math.max(0, w - PACK_INNER_MARGIN_MM)
    const innerH = Math.max(0, h - PACK_INNER_MARGIN_MM)
    const areaCm2 = ((innerW * innerH) / 100) * PACK_FILL_AVG
    return areaCm2 * RESIN_G_PER_CM2 * q
  }
  return 0
}

/**
 * Расход БОПП-пакетов: тираж, если флаг bopp_bag установлен. Из брифа.
 */
export function computeBoppQty({ qty, hasBopp }) {
  if (!hasBopp) return 0
  return Math.max(0, Math.floor(Number(qty) || 0))
}

/**
 * Сводный прогноз расхода материалов для формы заказа.
 * Возвращает массив строк, готовых к показу в виджете.
 *
 * Каждая строка: { key, label, expected, unit, lookup }
 *   - key      — стабильный ключ для React (film/lam/resin/bopp/box)
 *   - label    — человекочитаемый лейбл
 *   - expected — ожидаемый расход (число)
 *   - unit     — единица измерения для UI
 *   - lookup   — как искать остаток на складе:
 *       { by: 'code', value: 'G' }       — материал с material_code = value
 *       { by: 'type', value: 'packaging_bag' } — сумма stock_qty по type
 */
export function forecastMaterials({
  orderType,
  widthMm,
  heightMm,
  qty,
  filmType,
  lamType,
  boppBag,
}) {
  const rows = []
  const is3D = orderType === 'sticker3D' || orderType === 'stickerpack3D'
  const isStickerpack3D = orderType === 'stickerpack3D'
  const needLam = needsLamination(lamType)

  // 1. Плёнка для печати
  if (widthMm && heightMm && qty) {
    const blockW = getPrintBlockWidth(filmType)
    const filmMeters = computeFilmMeters({ widthMm, heightMm, qty, blockWidthMm: blockW })
    const filmLabel = filmType ? (FILM_TYPES[filmType]?.label || filmType) : '—'
    rows.push({
      key: 'film',
      label: `Плёнка${isStickerpack3D ? ' (фоны)' : ''}: ${filmLabel}`,
      expected: filmMeters,
      unit: 'м',
      lookup: filmType ? { by: 'code', value: filmType } : null,
    })
  }

  // 2. Плёнка для ламинации / переноса
  if (needLam && widthMm && heightMm && qty) {
    const lamMeters = computeLamMeters({ widthMm, heightMm, qty })
    rows.push({
      key: 'lam',
      label: `Ламинация / перенос: ${LAMINATION_TYPES[lamType]?.label || lamType}`,
      expected: lamMeters,
      unit: 'м',
      lookup: { by: 'code', value: lamType },
    })
  }

  // 3. Смола
  if (is3D && widthMm && heightMm && qty) {
    const resinG = computeResinGrams({ orderType, widthMm, heightMm, qty })
    rows.push({
      key: 'resin',
      label: 'Смола (с отвердителем)',
      expected: resinG,
      unit: 'г',
      lookup: { by: 'code', value: 'resin' },
    })
  }

  // 4. БОПП-пакет — тираж
  if (boppBag && qty) {
    rows.push({
      key: 'bopp',
      label: 'БОПП-пакет',
      expected: computeBoppQty({ qty, hasBopp: true }),
      unit: 'шт',
      lookup: { by: 'type', value: 'packaging_bag' },
    })
  }

  return rows
}
