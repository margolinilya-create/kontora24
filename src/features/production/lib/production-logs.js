/**
 * Production logs — pure functions for stage-based quantity tracking.
 * Workers log quantities at each stage. Order advances when total >= target (тираж).
 */

// Which fields are relevant for each production stage
export const STAGE_FIELDS = {
  print: {
    label: 'Печать',
    fields: [
      { key: 'stickers_printed', label: 'Стикеров напечатано', type: 'number', unit: 'шт', required: true },
      { key: 'backgrounds_printed', label: 'Фонов напечатано', type: 'number', unit: 'шт' },
      { key: 'film_meters', label: 'Плёнка использована', type: 'number', unit: 'м', step: '0.1' },
      { key: 'film_type', label: 'Тип плёнки', type: 'select', options: [
        { value: 'white', label: 'Белая' },
        { value: 'transparent', label: 'Прозрачная' },
        { value: 'holographic', label: 'Голографическая' },
        { value: 'metallic', label: 'Металлизированная' },
      ]},
    ],
    quantityField: 'stickers_printed',
  },
  post_processing: {
    label: 'Постобработка',
    fields: [
      { key: 'stickers_printed', label: 'Стикеров обработано', type: 'number', unit: 'шт', required: true },
    ],
    quantityField: 'stickers_printed',
  },
  resin_pouring: {
    label: 'Заливка',
    fields: [
      { key: 'stickers_poured', label: 'Стикеров залито всего', type: 'number', unit: 'шт', required: true },
      { key: 'stickers_good', label: 'Хороших (после ОТК)', type: 'number', unit: 'шт', required: true },
      { key: 'resin_grams', label: 'Расход смолы', type: 'number', unit: 'г', step: '0.1' },
    ],
    quantityField: 'stickers_good',
  },
  assembly: {
    label: 'Сборка',
    fields: [
      { key: 'packs_selected', label: 'Стикерпаков выбрано', type: 'number', unit: 'шт' },
      { key: 'packs_assembled', label: 'Стикерпаков собрано', type: 'number', unit: 'шт', required: true },
    ],
    quantityField: 'packs_assembled',
  },
  packaging: {
    label: 'Упаковка',
    fields: [
      { key: 'packs_packaged', label: 'Паков упаковано', type: 'number', unit: 'шт', required: true },
    ],
    quantityField: 'packs_packaged',
  },
}

/**
 * Compute progress for a given stage from production logs.
 * @param {Array} logs - production log entries for an order
 * @param {string} stage - production stage key
 * @param {number} targetQty - order.qty (тираж)
 * @returns {{ total: number, target: number, percentage: number, isComplete: boolean }}
 */
export function computeStageProgress(logs, stage, targetQty) {
  const config = STAGE_FIELDS[stage]
  if (!config) return { total: 0, target: targetQty, percentage: 0, isComplete: false }

  const qtyField = config.quantityField
  const stageLogs = logs.filter((l) => l.stage === stage)
  const total = stageLogs.reduce((sum, l) => sum + (Number(l[qtyField]) || 0), 0)
  const percentage = targetQty > 0 ? Math.min(100, Math.round((total / targetQty) * 100)) : 0

  return { total, target: targetQty, percentage, isComplete: total >= targetQty }
}

/**
 * Validate a log entry for a given stage.
 * Returns null if valid, or error message string.
 */
export function validateLogEntry(stage, data) {
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
  return null
}
