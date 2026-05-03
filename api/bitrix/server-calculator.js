// Server-side calculator logic (extracted for testability)
// This is the minimal server-side version used by the Bitrix webhook

export const DEFAULTS = {
  printWidth: 1230, heightMargin: 30, gap: 6, cutSpeed: 200,
  lamSpeed: 200, resinPerCm2: 0.1444, resinPourTime: 1200,
  laborCostPerHour: 500, filmPricePerM2: 180, inkPricePerM2: 120,
  resinPricePerG: 1.2, lamPricePerM2: 120,
}

export const MARKUPS = {
  sticker_cut: 4.0, sticker_kiss: 4.0, stickerpack: 4.0,
  sticker3D: 4.5, stickerpack3D: 4.5, rect: 4.0, big: 4.0,
}

export const DISCOUNTS = [
  { min: 1, max: 9, pct: 0 }, { min: 10, max: 24, pct: 0.05 },
  { min: 25, max: 49, pct: 0.10 }, { min: 50, max: 99, pct: 0.15 },
  { min: 100, max: 199, pct: 0.20 }, { min: 200, max: 499, pct: 0.25 },
  { min: 500, max: Infinity, pct: 0.30 },
]

export function calculate(width, height, qty, orderType, needLam, is3D, overrides = {}) {
  const C = { ...DEFAULTS, ...overrides }
  const w = Math.max(0, Number(width) || 0)
  const h = Math.max(0, Number(height) || 0)
  const q = Math.max(0, Math.floor(Number(qty) || 0))

  const itemsPerSheet = Math.floor(C.printWidth / (w + C.gap))
  const sheets = Math.ceil(q / Math.max(itemsPerSheet, 1))
  const filmM2 = sheets * (C.printWidth * (h + C.heightMargin)) / 1e6
  const inkM2 = (q * w * h) / 1e6
  const lamM2 = needLam ? filmM2 : 0
  const cutTimeH = (2 * (w + h) * q) / (C.cutSpeed * 1000) / 3.6
  const lamTimeH = needLam ? (filmM2 * 1e6) / (C.lamSpeed * C.printWidth) / 3600 : 0
  const resinG = is3D ? (w * h / 100) * C.resinPerCm2 * q : 0
  const resinTimeH = is3D ? (sheets * C.resinPourTime) / 3600 : 0

  const costMaterials = filmM2 * C.filmPricePerM2 + inkM2 * C.inkPricePerM2 + lamM2 * C.lamPricePerM2 + resinG * C.resinPricePerG
  const totalHours = cutTimeH + lamTimeH + resinTimeH + 0.5
  const costLabor = totalHours * C.laborCostPerHour
  const costTotal = costMaterials + costLabor

  const markup = MARKUPS[orderType] ?? 4.0
  const discount = (DISCOUNTS.find((d) => q >= d.min && q <= d.max) || { pct: 0 }).pct
  const priceFinal = costTotal * markup * (1 - discount)
  const pricePerUnit = q > 0 ? priceFinal / q : 0
  const prodDays = Math.max(1, Math.ceil(totalHours / 8))

  return {
    cost_materials: Math.round(costMaterials),
    cost_labor: Math.round(costLabor),
    cost_total: Math.round(costTotal),
    markup, discount_pct: discount,
    price_final: Math.round(priceFinal),
    price_per_unit: Math.round(pricePerUnit),
    prod_days: prodDays,
  }
}
