/**
 * Sticker production cost calculator — pure functions, no React.
 * Source of truth: docs/kontora24-plan.md §7
 */

import { ORDER_TYPES, VOLUME_DISCOUNTS } from '@/shared/constants'

// Default constants (can be overridden via settings)
export const DEFAULTS = {
  printWidth: 1230,        // mm — width of print block
  heightMargin: 30,        // mm — tech margin per sheet
  gap: 6,                  // mm — gap between items
  cutSpeed: 200,           // mm/s
  lamSpeed: 200,           // mm/s
  resinPerCm2: 0.1444,    // g/cm²
  resinPourTime: 1200,     // sec per sheet
  laborCostPerHour: 500,   // ₽/hour
  filmPricePerM2: 180,     // ₽/m²
  inkPricePerM2: 120,      // ₽/m²
  resinPricePerG: 1.2,     // ₽/g
  lamPricePerM2: 120,      // ₽/m²
}

export function getVolumeDiscount(qty) {
  if (qty <= 0) return 0
  const tier = VOLUME_DISCOUNTS.find((d) => qty >= d.min && qty <= d.max)
  return tier ? tier.discount : 0
}

export function getMarkup(orderType) {
  return ORDER_TYPES[orderType]?.markup ?? 4.0
}

/**
 * Main calculation
 * @param {Object} input
 * @param {number} input.width       - item width in mm
 * @param {number} input.height      - item height in mm
 * @param {number} input.qty         - quantity
 * @param {string} input.orderType   - order type key
 * @param {boolean} input.needLam    - needs lamination
 * @param {boolean} input.is3D       - needs resin (3D)
 * @param {Object}  [input.overrides] - override DEFAULTS
 * @returns {Object} calculation result
 */
export function calculate(input) {
  const { orderType, needLam = false, is3D = false, overrides = {} } = input
  const width = Math.max(0, Number(input.width) || 0)
  const height = Math.max(0, Number(input.height) || 0)
  const qty = Math.max(0, Math.floor(Number(input.qty) || 0))
  const C = { ...DEFAULTS, ...overrides }

  // 1. Layout
  const itemsPerSheet = Math.floor(C.printWidth / (width + C.gap))
  const sheets = Math.ceil(qty / Math.max(itemsPerSheet, 1))

  // 2. Film area (full sheet area)
  const sheetAreaM2 = (C.printWidth * (height + C.heightMargin)) / 1_000_000
  const filmM2 = sheets * sheetAreaM2

  // 3. Ink area (actual items only)
  const inkM2 = (qty * width * height) / 1_000_000

  // 4. Lamination (same as film if needed)
  const lamM2 = needLam ? filmM2 : 0

  // 5. Cutting time
  const perimeter = 2 * (width + height) // mm
  const cutTimeHours = (perimeter * qty) / (C.cutSpeed * 1000) / 3.6 // convert mm/s to hours

  // 6. Lamination time
  const lamTimeHours = needLam ? (filmM2 * 1_000_000) / (C.lamSpeed * C.printWidth) / 3600 : 0

  // 7. Resin (3D only)
  const itemAreaCm2 = (width * height) / 100 // mm² to cm²
  const resinG = is3D ? itemAreaCm2 * C.resinPerCm2 * qty : 0
  const resinTimeHours = is3D ? (sheets * C.resinPourTime) / 3600 : 0

  // 8. Material costs
  const costFilm = filmM2 * C.filmPricePerM2
  const costInk = inkM2 * C.inkPricePerM2
  const costLam = lamM2 * C.lamPricePerM2
  const costResin = resinG * C.resinPricePerG
  const costMaterials = costFilm + costInk + costLam + costResin

  // 9. Labor cost
  const totalHours = cutTimeHours + lamTimeHours + resinTimeHours + 0.5 // +0.5h for setup/handling
  const costLabor = totalHours * C.laborCostPerHour

  // 10. Totals
  const costTotal = costMaterials + costLabor
  const markup = getMarkup(orderType)
  const discount = getVolumeDiscount(qty)
  const priceFinal = costTotal * markup * (1 - discount)
  const pricePerUnit = qty > 0 ? priceFinal / qty : 0
  const margin = priceFinal - costTotal

  // 11. Production estimate (rough)
  const prodDays = Math.max(1, Math.ceil(totalHours / 8))

  return {
    // Layout
    itemsPerSheet,
    sheets,

    // Areas
    filmM2: round(filmM2, 3),
    inkM2: round(inkM2, 3),
    lamM2: round(lamM2, 3),
    resinG: round(resinG, 1),

    // Time
    cutTimeHours: round(cutTimeHours, 2),
    lamTimeHours: round(lamTimeHours, 2),
    resinTimeHours: round(resinTimeHours, 2),
    totalHours: round(totalHours, 2),

    // Costs
    costFilm: round(costFilm),
    costInk: round(costInk),
    costLam: round(costLam),
    costResin: round(costResin),
    costMaterials: round(costMaterials),
    costLabor: round(costLabor),
    costTotal: round(costTotal),

    // Pricing
    markup,
    discount,
    priceFinal: round(priceFinal),
    pricePerUnit: round(pricePerUnit),
    margin: round(margin),
    marginPct: priceFinal > 0 ? round((margin / priceFinal) * 100, 1) : 0,

    // Production
    prodDays,
  }
}

function round(n, decimals = 0) {
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}
