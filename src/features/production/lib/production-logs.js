/**
 * Production logs — pure functions for stage-based quantity tracking.
 * Workers log quantities at each stage. Order advances when total >= target (тираж).
 */

// Which fields are relevant for each production stage
export const STAGE_FIELDS = {
  print: {
    label: 'Печать',
    quantityField: 'stickers_printed',
    fields: [
      { key: 'stickers_printed', label: 'Стикеров напечатано', unit: 'шт' },
      { key: 'backgrounds_printed', label: 'Фонов напечатано', unit: 'шт' },
      { key: 'film_meters', label: 'Плёнка', unit: 'м', step: '0.1' },
      { key: 'film_type', label: 'Тип плёнки', type: 'text' },
    ],
  },
  lamination: {
    label: 'Ламинация',
    quantityField: 'lamination_meters',
    fields: [
      { key: 'lamination_meters', label: 'Ламинация', unit: 'м', step: '0.1' },
      { key: 'defects', label: 'Брак', unit: 'шт' },
    ],
  },
  cutting: {
    label: 'Резка',
    quantityField: 'qty_cut',
    fields: [
      { key: 'qty_cut', label: 'Нарезано', unit: 'шт' },
      { key: 'defects', label: 'Брак', unit: 'шт' },
    ],
  },
  pouring: {
    label: 'Заливка',
    quantityField: 'stickers_good',
    fields: [
      { key: 'stickers_poured', label: 'Залито', unit: 'шт' },
      { key: 'stickers_good', label: 'Хороших', unit: 'шт' },
      { key: 'defects', label: 'Брак', unit: 'шт' },
      { key: 'resin_grams', label: 'Смола', unit: 'г', step: '0.1' },
    ],
  },
  selection_pouring: {
    label: 'Выборка / Заливка',
    quantityField: 'qty_selected',
    fields: [
      { key: 'qty_selected', label: 'Выбрано фонов', unit: 'шт' },
      { key: 'stickers_poured', label: 'Залито стикеров', unit: 'шт' },
      { key: 'stickers_good', label: 'Хороших стикеров', unit: 'шт' },
      { key: 'defects', label: 'Брак', unit: 'шт' },
      { key: 'resin_grams', label: 'Смола', unit: 'г', step: '0.1' },
    ],
  },
  assembly_3d: {
    label: 'Сборка 3D',
    quantityField: 'packs_assembled',
    enforceTargetLimit: true,
    fields: [
      { key: 'packs_assembled', label: 'Собрано паков', unit: 'шт' },
    ],
  },
  packaging: {
    label: 'Упаковка',
    quantityField: 'packs_packaged',
    enforceTargetLimit: true,
    fields: [
      { key: 'packs_packaged', label: 'Упаковано', unit: 'шт' },
    ],
  },
}

/**
 * Compute progress for a given stage from production logs.
 * @param {Array} logs - production log entries for an order
 * @param {string} stage - production stage key
 * @param {number} targetQty - order.qty (тираж)
 * @param {string} [track] - optional track filter (e.g. 'backgrounds', 'stickers')
 * @returns {{ total: number, target: number, percentage: number, isComplete: boolean }}
 */
export function computeStageProgress(logs, stage, targetQty, track) {
  const config = STAGE_FIELDS[stage]
  if (!config) return { total: 0, target: targetQty, percentage: 0, isComplete: false }

  const qtyField = config.quantityField
  let stageLogs = logs.filter((l) => l.stage === stage)
  if (track) {
    stageLogs = stageLogs.filter((l) => l.track === track)
  }
  const total = stageLogs.reduce((sum, l) => sum + (Number(l[qtyField]) || 0), 0)
  const percentage = targetQty > 0 ? Math.min(100, Math.round((total / targetQty) * 100)) : 0

  return { total, target: targetQty, percentage, isComplete: total >= targetQty }
}

// Field used for each track at dual-track stages
const DUAL_TRACK_FIELDS = {
  print: { backgrounds: 'backgrounds_printed', stickers: 'stickers_printed' },
  cutting: { backgrounds: 'qty_cut', stickers: 'qty_cut' },
  selection_pouring: { backgrounds: 'qty_selected', stickers: 'stickers_good' },
}

/**
 * Compute progress for both tracks (backgrounds + stickers) at a dual-track stage.
 * @param {Array} logs - production log entries for an order
 * @param {string} stage - production stage key
 * @param {number} targetQty - order.qty (тираж)
 * @returns {{ backgrounds: { total, target, percentage, isComplete }, stickers: { total, target, percentage, isComplete }, bothComplete: boolean }}
 */
export function computeDualTrackProgress(logs, stage, targetQty) {
  const trackFields = DUAL_TRACK_FIELDS[stage]
  if (!trackFields) {
    const empty = { total: 0, target: targetQty, percentage: 0, isComplete: false }
    return { backgrounds: { ...empty }, stickers: { ...empty }, bothComplete: false }
  }

  function computeTrack(trackName) {
    const field = trackFields[trackName]
    const trackLogs = logs.filter((l) => l.stage === stage && l.track === trackName)
    const total = trackLogs.reduce((sum, l) => sum + (Number(l[field]) || 0), 0)
    const percentage = targetQty > 0 ? Math.min(100, Math.round((total / targetQty) * 100)) : 0
    return { total, target: targetQty, percentage, isComplete: total >= targetQty }
  }

  const backgrounds = computeTrack('backgrounds')
  const stickers = computeTrack('stickers')

  return { backgrounds, stickers, bothComplete: backgrounds.isComplete && stickers.isComplete }
}

/**
 * Validate a log entry for a given stage.
 * Returns null if valid, or error message string.
 *
 * @param {string} stage
 * @param {object} data
 * @param {{ progress?: { total: number, target: number } }} [options]
 *   When `progress` is supplied and the stage has `enforceTargetLimit`, we
 *   refuse entries that would push the running total past `target`.
 */
export function validateLogEntry(stage, data, options = {}) {
  const config = STAGE_FIELDS[stage]
  if (!config) return 'Неизвестный этап'

  for (const field of config.fields) {
    if (field.required && !data[field.key] && data[field.key] !== 0) {
      return `Заполните поле "${field.label}"`
    }
    if (field.type === 'number' && data[field.key] !== undefined && data[field.key] !== '') {
      const num = Number(data[field.key])
      if (isNaN(num) || num < 0) return `"${field.label}" должно быть положительным числом`
    }
  }

  if (config.enforceTargetLimit && options.progress && config.quantityField) {
    const incoming = Number(data[config.quantityField] || 0)
    if (incoming > 0) {
      const remaining = Math.max(0, options.progress.target - options.progress.total)
      if (incoming > remaining) {
        return `Превышен тираж (${options.progress.target} шт). Осталось внести: ${remaining}`
      }
    }
  }

  return null
}
