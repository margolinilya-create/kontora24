/**
 * Sticker production cost calculator — kontorasales model.
 * Cost per cm² → logarithmic markup curve → options multipliers.
 */

// Default cost components per cm² (configurable via settings)
export const DEFAULTS = {
  // Film costs per cm²
  filmWhite: 0.10,           // White / transparent film
  filmHolographic: 0.11,     // Holographic film
  filmMetallic: 0.15,        // Gold / chrome film
  ink: 0.03,                 // Ink per cm²
  laborPrint: 0.02,          // Print labor per cm²
  rent: 0.01,                // Rent + electricity per cm²
  tax: 0.005,                // Tax (USN) per cm²
  lamination: 0.03,          // Lamination per cm²
  // 3D resin extras per cm²
  resinPerCm2: 0.05,         // Resin cost per cm²
  laborResin: 0.03,          // Resin labor per cm² (sticker x0.5, pack x1.0)
  resinRent: 0.01,           // Rent for resin workspace
  resinTax: 0.005,           // Tax for resin
  // Markup curves: [max_markup_at_20, min_markup_at_3000+]
  markupVinylSticker: [4.0, 1.5],
  markupVinylPack: [3.0, 1.6],
  markup3DSticker: [5.0, 2.5],
  markup3DPack: [3.0, 1.8],
  // Qty range for markup curve
  qtyMin: 20,
  qtyMax: 3000,
  // Fixed costs
  designPrice: 5000,         // Full design from scratch
  editPrice: 3000,           // Design edit/revision
  extraVariantPrice: 1000,   // Per extra variant/design beyond first
  montageFilmPricePerCm2: 0.03, // Montage film per cm²
  packagingPrice: 3,         // Per unit individual packaging
  // Option multipliers
  urgentMult: 0.30,          // +30% for urgent
  partnerDiscount: 0.25,     // -25% for partner
  individualCutMult: 0.15,   // +15% for individual cutting
}

/**
 * Get logarithmic markup based on quantity.
 * Formula: markup = max × (min / max)^t
 * where t = log(qty / qtyMin) / log(qtyMax / qtyMin)
 */
export function getMarkup(qty, markupRange, qtyMin = 20, qtyMax = 3000) {
  const [max, min] = markupRange
  if (qty <= qtyMin) return max
  if (qty >= qtyMax) return min
  const t = Math.log(qty / qtyMin) / Math.log(qtyMax / qtyMin)
  return max * Math.pow(min / max, t)
}

/**
 * Get the right markup curve based on order type.
 */
function getMarkupCurve(orderType, is3D, C) {
  if (is3D) {
    return orderType === 'stickerpack3D' || orderType === 'stickerpack'
      ? C.markup3DPack : C.markup3DSticker
  }
  return orderType === 'stickerpack' || orderType === 'sticker_kiss'
    ? C.markupVinylPack : C.markupVinylSticker
}

/**
 * Main calculation.
 * @param {Object} input
 * @param {number} input.width       - width in mm
 * @param {number} input.height      - height in mm
 * @param {number} input.qty         - quantity
 * @param {string} input.orderType   - order type key
 * @param {string} input.filmType    - white/holographic/metallic
 * @param {boolean} input.needLam    - needs lamination
 * @param {boolean} input.is3D       - 3D resin
 * @param {boolean} input.isUrgent   - urgent surcharge
 * @param {boolean} input.isPartner  - partner discount
 * @param {boolean} input.needsMontageFilm - montage film
 * @param {boolean} input.needsIndividualCut - individual cutting
 * @param {boolean} input.needsDesign  - design from scratch
 * @param {boolean} input.needsEdit    - design edit
 * @param {boolean} input.needsPackaging - individual packaging
 * @param {number}  input.designVariants - number of design variants
 * @param {Object}  [input.overrides] - override DEFAULTS
 */
export function calculate(input) {
  const {
    orderType = 'sticker_cut', filmType = 'white',
    needLam = false, is3D = false,
    isUrgent = false, isPartner = false,
    needsMontageFilm = false, needsIndividualCut = false,
    needsDesign = false, needsEdit = false, needsPackaging = false,
    designVariants = 1, overrides = {},
  } = input
  const width = Math.max(1, Number(input.width) || 0)
  const height = Math.max(1, Number(input.height) || 0)
  const qty = Math.max(1, Math.floor(Number(input.qty) || 1))
  const C = { ...DEFAULTS, ...overrides }

  // 1. Area
  const areaCm2 = (width * height) / 100  // mm² → cm²
  const areaM2 = areaCm2 / 10000

  // 2. Cost per cm² (base)
  const filmCostPerCm2 = filmType === 'metallic' ? C.filmMetallic
    : filmType === 'holographic' ? C.filmHolographic : C.filmWhite
  let costPerCm2 = filmCostPerCm2 + C.ink + C.laborPrint + C.rent + C.tax
  if (needLam) costPerCm2 += C.lamination

  // 3. 3D extras
  if (is3D) {
    const resinLaborMult = orderType.includes('pack') ? 1.0 : 0.5
    costPerCm2 += C.resinPerCm2 + (C.laborResin * resinLaborMult) + C.resinRent + C.resinTax
  }

  // 4. Cost per unit
  const costPerUnit = costPerCm2 * areaCm2

  // 5. Markup (logarithmic curve)
  const markupCurve = getMarkupCurve(orderType, is3D, C)
  const markup = getMarkup(qty, markupCurve, C.qtyMin, C.qtyMax)

  // 6. Base price per unit
  let pricePerUnit = costPerUnit * markup

  // 7. Multiplicative options
  if (isUrgent) pricePerUnit *= (1 + C.urgentMult)
  if (isPartner) pricePerUnit *= (1 - C.partnerDiscount)
  if (needsIndividualCut) pricePerUnit *= (1 + C.individualCutMult)

  // 8. Additive per-unit options
  if (needsPackaging) pricePerUnit += C.packagingPrice
  if (needsMontageFilm) pricePerUnit += C.montageFilmPricePerCm2 * areaCm2

  // 9. Total price
  let priceTotal = pricePerUnit * qty

  // 10. Fixed costs
  const extraVariants = Math.max(0, designVariants - 1)
  const fixedCosts = (needsDesign ? C.designPrice : 0)
    + (needsEdit ? C.editPrice : 0)
    + (extraVariants * C.extraVariantPrice)
  priceTotal += fixedCosts

  // 11. Cost totals
  const costMaterials = costPerUnit * qty
  const costTotal = costMaterials
  const margin = priceTotal - costTotal
  const prodDays = Math.max(1, Math.ceil(qty / 500))

  return {
    // Area
    areaCm2: round(areaCm2, 2),
    areaM2: round(areaM2 * qty, 3),

    // Costs
    costPerCm2: round(costPerCm2, 4),
    costPerUnit: round(costPerUnit, 2),
    costMaterials: round(costMaterials),
    costTotal: round(costTotal),

    // Pricing
    markup: round(markup, 2),
    pricePerUnit: round(pricePerUnit),
    priceFinal: round(priceTotal),
    fixedCosts: round(fixedCosts),
    margin: round(margin),
    marginPct: priceTotal > 0 ? round((margin / priceTotal) * 100, 1) : 0,

    // Production
    prodDays,

    // For display
    filmType,
    discount: 0,
    costLabor: 0,
  }
}

/**
 * Generate price tiers table for different quantities.
 */
export function calculatePriceTiers(input) {
  const tiers = [20, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000]
  return tiers.map((qty) => {
    const result = calculate({ ...input, qty })
    return {
      qty,
      pricePerUnit: result.pricePerUnit,
      priceTotal: result.priceFinal,
      markup: result.markup,
      costPerUnit: result.costPerUnit,
    }
  })
}

function round(n, decimals = 0) {
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}
