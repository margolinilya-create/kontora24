/**
 * Production logs — pure functions для stage-based учёта количества.
 *
 * Архитектура полей:
 * — Каждый stage имеет `fields` (одиночный трек) ИЛИ `tracks` (массив треков
 *   для stickerpack3D dual-track-этапов: print / cutting / selection_pouring).
 * — Когда форма submit'ит трек-данные, в БД создаётся отдельная запись лога
 *   с `track`='backgrounds'/'stickers' (или null для одиночного трека).
 * — film_type больше не вводится вручную в форму — берётся из заказа
 *   (order.film_type / order.film_type_stickers).
 */

export const STAGE_FIELDS = {
  print: {
    label: 'Печать',
    quantityField: 'stickers_printed',
    // Для stickerpack3D — два трека (стикеры + фоны). Для остальных — одна группа.
    tracks: [
      {
        key: 'stickers',
        label: 'Стикеры',
        accent: 'bg-dept-pouring/10 border-dept-pouring/30',
        fields: [
          { key: 'stickers_printed', label: 'Стикеров напечатано', unit: 'шт' },
          { key: 'film_meters', label: 'Плёнка стикеров', unit: 'м', step: '0.1', filmFrom: 'stickers' },
        ],
      },
      {
        key: 'backgrounds',
        label: 'Фоны',
        accent: 'bg-dept-print/10 border-dept-print/30',
        fields: [
          { key: 'backgrounds_printed', label: 'Фонов напечатано', unit: 'шт' },
          { key: 'film_meters', label: 'Плёнка фонов', unit: 'м', step: '0.1', filmFrom: 'backgrounds' },
        ],
      },
    ],
    fields: [
      { key: 'stickers_printed', label: 'Стикеров напечатано', unit: 'шт' },
      { key: 'film_meters', label: 'Плёнка', unit: 'м', step: '0.1', filmFrom: 'backgrounds' },
    ],
  },

  lamination: {
    label: 'Ламинация',
    quantityField: 'lamination_qty',
    enforceTargetLimit: true,
    // По ТЗ: «Заламинировано (шт)» слева + «Брак (шт)» справа + «Ламинация (м)» как расход.
    fields: [
      { key: 'lamination_qty', label: 'Заламинировано', unit: 'шт' },
      { key: 'defects', label: 'Брак', unit: 'шт' },
      { key: 'lamination_meters', label: 'Ламинация (расход)', unit: 'м', step: '0.1' },
    ],
  },

  cutting: {
    label: 'Резка',
    quantityField: 'qty_cut',
    enforceTargetLimit: true,
    tracks: [
      {
        key: 'stickers',
        label: 'Стикеры',
        accent: 'bg-dept-pouring/10 border-dept-pouring/30',
        fields: [
          { key: 'qty_cut', label: 'Нарезано стикеров', unit: 'шт' },
          { key: 'defects', label: 'Брак', unit: 'шт' },
        ],
      },
      {
        key: 'backgrounds',
        label: 'Фоны',
        accent: 'bg-dept-print/10 border-dept-print/30',
        fields: [
          { key: 'qty_cut', label: 'Нарезано фонов', unit: 'шт' },
          { key: 'defects', label: 'Брак', unit: 'шт' },
        ],
      },
    ],
    fields: [
      { key: 'qty_cut', label: 'Нарезано', unit: 'шт' },
      { key: 'defects', label: 'Брак', unit: 'шт' },
    ],
  },

  pouring: {
    label: 'Заливка',
    quantityField: 'stickers_good',
    enforceTargetLimit: true,
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
    enforceTargetLimit: true,
    // По ТЗ: убран `defects`. Отдельно — расход смолы через resinOnly-трек.
    tracks: [
      {
        key: 'stickers',
        label: 'Стикеры',
        accent: 'bg-dept-pouring/10 border-dept-pouring/30',
        fields: [
          { key: 'stickers_good', label: 'Залито стикеров (хороших)', unit: 'шт' },
        ],
      },
      {
        key: 'backgrounds',
        label: 'Фоны',
        accent: 'bg-dept-print/10 border-dept-print/30',
        fields: [
          { key: 'qty_selected', label: 'Выбрано фонов', unit: 'шт' },
        ],
      },
    ],
    fields: [
      { key: 'qty_selected', label: 'Выбрано фонов', unit: 'шт' },
      { key: 'stickers_good', label: 'Хороших стикеров', unit: 'шт' },
    ],
    // Отдельный лог расхода смолы (без track)
    resinExtra: { key: 'resin_grams', label: 'Расход смолы', unit: 'г', step: '0.1' },
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
    // По ТЗ: «возможность вносить больше необходимого тиража» → enforceTargetLimit=false.
    fields: [
      { key: 'packs_packaged', label: 'Упаковано', unit: 'шт' },
      { key: 'defects', label: 'Брак', unit: 'шт' },
    ],
  },
}

/**
 * Compute progress for a given stage from production logs.
 */
export function computeStageProgress(logs, stage, targetQty, track) {
  const config = STAGE_FIELDS[stage]
  if (!config) return { total: 0, target: targetQty, percentage: 0, isComplete: false }

  const qtyField = config.quantityField
  let stageLogs = logs.filter((l) => l.stage === stage)
  if (track) stageLogs = stageLogs.filter((l) => l.track === track)
  const total = stageLogs.reduce((sum, l) => sum + (Number(l[qtyField]) || 0), 0)
  const percentage = targetQty > 0 ? Math.min(100, Math.round((total / targetQty) * 100)) : 0
  return { total, target: targetQty, percentage, isComplete: total >= targetQty }
}

const DUAL_TRACK_FIELDS = {
  print: { backgrounds: 'backgrounds_printed', stickers: 'stickers_printed' },
  cutting: { backgrounds: 'qty_cut', stickers: 'qty_cut' },
  selection_pouring: { backgrounds: 'qty_selected', stickers: 'stickers_good' },
}

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

  return {
    backgrounds: computeTrack('backgrounds'),
    stickers: computeTrack('stickers'),
    bothComplete: computeTrack('backgrounds').isComplete && computeTrack('stickers').isComplete,
  }
}

/**
 * Сколько изделий «приходит» на этап с предыдущего.
 * Для линейных этапов считается по quantityField предыдущего этапа из ORDER_ROUTES.
 * Для dual-track этапов считается с учётом трека.
 *
 * @param {Array} logs
 * @param {string[]} route — ORDER_ROUTES для заказа
 * @param {string} stage
 * @param {number} targetQty
 * @param {string|null} track
 * @returns {{ total: number, source: string|null }}
 */
export function computeIncoming(logs, route, stage, targetQty, track) {
  if (!route || !route.includes(stage)) return { total: targetQty, source: null }
  const idx = route.indexOf(stage)
  if (idx <= 0) return { total: targetQty, source: null }

  // Идём назад по маршруту до ближайшего этапа с qty-логом (skip 'new'/'design'/'prepress')
  for (let i = idx - 1; i >= 0; i--) {
    const prev = route[i]
    const cfg = STAGE_FIELDS[prev]
    if (!cfg) continue
    // На предыдущем этапе считаем по его quantityField и трек-фильтру
    const prevQtyField = cfg.quantityField
    if (!prevQtyField) continue
    let stageLogs = logs.filter((l) => l.stage === prev)
    if (track) stageLogs = stageLogs.filter((l) => !l.track || l.track === track)
    const total = stageLogs.reduce((sum, l) => sum + (Number(l[prevQtyField]) || 0), 0)
    if (total > 0) return { total, source: prev }
  }
  return { total: targetQty, source: null }
}

/**
 * Validate a log entry for a given stage.
 *
 * @param {string} stage
 * @param {object} data
 * @param {object} [options]
 *   options.progress — {total, target} прогресс по quantityField
 *   options.incoming — {total} сколько пришло с предыдущего этапа (для проверки «не больше чем приходит»)
 *   options.allowOvershoot — для packaging, можно превышать тираж
 */
export function validateLogEntry(stage, data, options = {}) {
  const config = STAGE_FIELDS[stage]
  if (!config) return 'Неизвестный этап'

  const fields = config.fields || []
  for (const field of fields) {
    if (field.required && !data[field.key] && data[field.key] !== 0) {
      return `Заполните поле "${field.label}"`
    }
    if (data[field.key] !== undefined && data[field.key] !== '') {
      const num = Number(data[field.key])
      if (isNaN(num) || num < 0) return `"${field.label}" должно быть положительным числом`
    }
  }

  // Лимит по тиражу
  if (config.enforceTargetLimit && options.progress && config.quantityField && !options.allowOvershoot) {
    const incoming = Number(data[config.quantityField] || 0)
    if (incoming > 0) {
      const remaining = Math.max(0, options.progress.target - options.progress.total)
      if (incoming > remaining) {
        return `Превышен тираж (${options.progress.target} шт). Осталось внести: ${remaining}`
      }
    }
  }

  // Лимит по приходу с предыдущего этапа (по ТЗ — нельзя ввести больше чем поступило)
  if (options.incoming && config.quantityField && !options.allowOvershoot) {
    const incoming = Number(data[config.quantityField] || 0)
    const defects = Number(data.defects || 0)
    const incomingPlusDefects = incoming + defects
    const remaining = Math.max(0, options.incoming.total - options.progress?.total || 0)
    if (incomingPlusDefects > options.incoming.total - (options.progress?.total || 0)) {
      return `На этап поступило ${options.incoming.total} шт. Осталось: ${remaining}`
    }
  }

  return null
}
