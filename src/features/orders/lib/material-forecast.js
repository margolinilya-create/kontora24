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

// R13.4 (бриф 02.06): плёнка стикеров 3D-пака считается отдельно от плёнки фонов.
// Формула менеджера:
//   m² = (W × H × 0.65 × qty × 1.3) / 1_000_000
//   метры по плёнке шириной 1230 мм = m² / 1.23
const PACK_STICKER_FILM_COVERAGE = 0.65 // Коэф. покрытия стикерами площади
const PACK_STICKER_FILM_MARGIN = 1.3    // Запас 30% к тиражу
const PACK_STICKER_FILM_WIDTH_M = 1.23  // Рабочая ширина плёнки в метрах

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
 * R13.4 (бриф 02.06): расход плёнки СТИКЕРОВ для 3D-стикерпака в метрах.
 * Формула менеджера:
 *   m² = (W × H × 0.65 × qty × 1.3) / 1_000_000
 *   m = m² / 1.23
 * Возвращает метры плёнки 1230 мм. Если размер/тираж не задан — 0.
 */
export function computeStickerFilmMeters({ widthMm, heightMm, qty }) {
  const w = Number(widthMm) || 0
  const h = Number(heightMm) || 0
  const q = Math.floor(Number(qty) || 0)
  if (!w || !h || !q) return 0
  const areaMm2 = w * h * PACK_STICKER_FILM_COVERAGE * q * PACK_STICKER_FILM_MARGIN
  const areaM2 = areaMm2 / 1_000_000
  return areaM2 / PACK_STICKER_FILM_WIDTH_M
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
 *
 * Поддерживает multi-variant (R8.3): если передан `items` — это массив
 * { widthMm, heightMm, qty } по видам изделий, расход суммируется по всем.
 * Если items не передан — используются widthMm/heightMm/qty (одиночный вид).
 */
export function forecastMaterials({
  orderType,
  widthMm,
  heightMm,
  qty,
  filmType,
  filmTypeStickers,
  lamType,
  boppBag,
  items,
}) {
  const rows = []
  const is3D = orderType === 'sticker3D' || orderType === 'stickerpack3D'
  const isStickerpack3D = orderType === 'stickerpack3D'
  const needLam = needsLamination(lamType)

  // Нормализуем items: либо переданный массив, либо одна позиция из основных
  // полей. Отбрасываем строки без размера/тиража — они ничего не считают.
  const itemList = (Array.isArray(items) && items.length > 0
    ? items
    : [{ widthMm, heightMm, qty }]
  ).filter((it) => Number(it.widthMm) > 0 && Number(it.heightMm) > 0 && Math.floor(Number(it.qty) || 0) > 0)

  if (itemList.length === 0) return rows

  // 1. Плёнка для печати — суммируем по items
  const blockW = getPrintBlockWidth(filmType)
  const filmMeters = itemList.reduce((sum, it) => sum + computeFilmMeters({
    widthMm: it.widthMm, heightMm: it.heightMm, qty: it.qty, blockWidthMm: blockW,
  }), 0)
  const filmLabel = filmType ? (FILM_TYPES[filmType]?.label || filmType) : '—'
  rows.push({
    key: 'film',
    label: `Плёнка${isStickerpack3D ? ' (фоны)' : ''}: ${filmLabel}`,
    expected: filmMeters,
    unit: 'м',
    lookup: filmType ? { by: 'code', value: filmType } : null,
  })

  // 1b. R13.4 (бриф 02.06): для 3D-стикерпака отдельная плёнка для СТИКЕРОВ
  // по формуле менеджера. Если filmTypeStickers не задан — lookup тоже null
  // (виджет покажет «—», лимита склада не будет).
  const filmTypeStickersEff = filmTypeStickers || null
  if (isStickerpack3D) {
    const stickerFilmMeters = itemList.reduce(
      (sum, it) => sum + computeStickerFilmMeters({
        widthMm: it.widthMm, heightMm: it.heightMm, qty: it.qty,
      }),
      0,
    )
    if (stickerFilmMeters > 0) {
      const stickFilmLabel = filmTypeStickersEff
        ? (FILM_TYPES[filmTypeStickersEff]?.label || filmTypeStickersEff)
        : '—'
      rows.push({
        key: 'film_stickers',
        label: `Плёнка (стикеры): ${stickFilmLabel}`,
        expected: stickerFilmMeters,
        unit: 'м',
        lookup: filmTypeStickersEff ? { by: 'code', value: filmTypeStickersEff } : null,
      })
    }
  }

  // 2. Плёнка для ламинации / переноса
  if (needLam) {
    const lamMeters = itemList.reduce((sum, it) => sum + computeLamMeters({
      widthMm: it.widthMm, heightMm: it.heightMm, qty: it.qty,
    }), 0)
    rows.push({
      key: 'lam',
      label: `Ламинация / перенос: ${LAMINATION_TYPES[lamType]?.label || lamType}`,
      expected: lamMeters,
      unit: 'м',
      lookup: { by: 'code', value: lamType },
    })
  }

  // 3. Смола
  if (is3D) {
    const resinG = itemList.reduce((sum, it) => sum + computeResinGrams({
      orderType, widthMm: it.widthMm, heightMm: it.heightMm, qty: it.qty,
    }), 0)
    rows.push({
      key: 'resin',
      label: 'Смола (с отвердителем)',
      expected: resinG,
      unit: 'г',
      lookup: { by: 'code', value: 'resin' },
    })
  }

  // 4. БОПП-пакет — суммарный тираж по items
  if (boppBag) {
    const totalQty = itemList.reduce((sum, it) => sum + Math.max(0, Math.floor(Number(it.qty) || 0)), 0)
    if (totalQty > 0) {
      rows.push({
        key: 'bopp',
        label: 'БОПП-пакет',
        expected: totalQty,
        unit: 'шт',
        lookup: { by: 'type', value: 'packaging_bag' },
      })
    }
  }

  return rows
}
