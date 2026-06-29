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
  // R11.0 — новые этапы перед основным циклом производства.
  // sample_layout / color_approval / batch_layout — БЕЗ полей (UI добавит
  // EmptyStageAction / ColorApprovalControls в R11.1).
  sample_print: {
    label: 'Печать образца',
    quantityField: 'sample_film_meters',
    fields: [
      { key: 'sample_film_meters', label: 'Плёнка образца', unit: 'м', step: '0.1' },
    ],
  },

  // R13.2 (бриф 02.06): на препрессе менеджер вводит «сколько подготовлено
  // стикеров/изделий к печати». Поле prepared_qty добавлено миграцией 051.
  prepress: {
    label: 'Препресс',
    quantityField: 'prepared_qty',
    fields: [
      { key: 'prepared_qty', label: 'Подготовлено к печати', unit: 'шт' },
    ],
  },

  // Сушка — таймер 36ч (см. R11.2). На этапе только фиксируется брак.
  // quantityField не задан — completion определяется таймером, не qty-полем.
  drying: {
    label: 'Сушка',
    fields: [
      { key: 'defects', label: 'Брак', unit: 'шт' },
    ],
  },

  // Выборка штучных стикеров (для sticker3D после сушки).
  selection: {
    label: 'Выборка',
    quantityField: 'qty_selected',
    fields: [
      { key: 'qty_selected', label: 'Выбрано', unit: 'шт' },
    ],
  },

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
          { key: 'stickers_printed', label: 'Напечатано', unit: 'шт' },
          { key: 'film_meters', label: 'Плёнка стикеров', unit: 'м', step: '0.1', filmFrom: 'stickers' },
        ],
      },
      {
        key: 'backgrounds',
        label: 'Фоны',
        accent: 'bg-dept-print/10 border-dept-print/30',
        fields: [
          { key: 'backgrounds_printed', label: 'Напечатано фонов', unit: 'шт' },
          { key: 'film_meters', label: 'Плёнка фонов', unit: 'м', step: '0.1', filmFrom: 'backgrounds' },
        ],
      },
    ],
    fields: [
      { key: 'stickers_printed', label: 'Напечатано', unit: 'шт' },
      { key: 'film_meters', label: 'Плёнка', unit: 'м', step: '0.1', filmFrom: 'backgrounds' },
    ],
  },

  lamination: {
    label: 'Ламинация',
    quantityField: 'lamination_qty',
    // «Заламинировано (шт)» + «Брак (шт)» + «Ламинация (м)» с авто-лейблом плёнки заказа.
    fields: [
      { key: 'lamination_qty', label: 'Заламинировано', unit: 'шт' },
      { key: 'defects', label: 'Брак', unit: 'шт' },
      { key: 'lamination_meters', label: 'Ламинация (расход)', unit: 'м', step: '0.1', appendFilm: 'backgrounds' },
    ],
  },

  cutting: {
    label: 'Резка',
    quantityField: 'qty_cut',
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
    // R13.2 (бриф 02.06): брак убран с этого этапа — учитывается на drying,
    // где вычитается из общего числа залитых. stickers_good = stickers_poured
    // (пишется автоматом при submit в ProductionLogForm).
    quantityField: 'stickers_good',
    fields: [
      { key: 'stickers_poured', label: 'Залито', unit: 'шт' },
      { key: 'resin_grams', label: 'Смола', unit: 'г', step: '0.1' },
    ],
  },

  selection_pouring: {
    label: 'Выборка / Заливка',
    quantityField: 'qty_selected',
    tracks: [
      {
        key: 'stickers',
        label: 'Стикеры',
        accent: 'bg-dept-pouring/10 border-dept-pouring/30',
        // R13.2: брак убран и здесь (consistency со спекой 11.05).
        fields: [
          { key: 'stickers_poured', label: 'Залито', unit: 'шт' },
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
      { key: 'stickers_poured', label: 'Залито стикеров', unit: 'шт' },
    ],
    resinExtra: { key: 'resin_grams', label: 'Расход смолы', unit: 'г', step: '0.1' },
  },

  assembly_3d: {
    label: 'Сборка 3D',
    quantityField: 'packs_assembled',
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
 * Этапы, на которых брак должен вычитаться из «годных» в шкале прогресса.
 * Для pouring/selection_pouring брак НЕ вычитается — поле stickers_good /
 * qty_selected уже представляет годные изделия (фидбэк менеджера 17.05).
 *
 * R15.5 (бриф 04.06 #12, audit): экспортируем чтобы OrderProgressTab.aggregateLine
 * импортировал ту же константу. Раньше там был дубль с лишним 'drying' (на drying
 * aggregateLine идёт по кастомной ветке и сет не читает — dead code).
 */
export const SUBTRACT_DEFECTS_STAGES = new Set(['print', 'cutting', 'lamination', 'packaging'])

// Поле количества, которое РЕАЛЬНО пишется на dual-track этапах в зависимости
// от трека. На print трек 'backgrounds' хранит backgrounds_printed (а
// quantityField этапа — stickers_printed); на selection_pouring трек 'stickers'
// хранит stickers_good (а quantityField — qty_selected). Прогресс трека обязан
// читать ИМЕННО это поле — иначе бар трека всегда 0 (фидбэк 29.06, аудит).
const DUAL_TRACK_FIELDS = {
  print: { backgrounds: 'backgrounds_printed', stickers: 'stickers_printed' },
  cutting: { backgrounds: 'qty_cut', stickers: 'qty_cut' },
  selection_pouring: { backgrounds: 'qty_selected', stickers: 'stickers_good' },
}

/**
 * Compute progress for a given stage from production logs.
 * Брак вычитается из total для этапов из SUBTRACT_DEFECTS_STAGES.
 *
 * Поле количества разрешается с учётом трека через DUAL_TRACK_FIELDS — на
 * dual-track этапах разные треки пишут разные поля (см. коммент выше). Фильтр
 * по треку применяется ТОЛЬКО к этапам, которые действительно хранят данные
 * по трекам (есть `tracks` в STAGE_FIELDS или запись в DUAL_TRACK_FIELDS).
 * Для одиночных этапов (напр. ламинация фонов пишется с track=null) переданный
 * трек игнорируется, иначе фильтр обнулял бы прогресс.
 */
export function computeStageProgress(logs, stage, targetQty, track) {
  const config = STAGE_FIELDS[stage]
  if (!config) return { total: 0, target: targetQty, percentage: 0, isComplete: false }

  const trackField = track && DUAL_TRACK_FIELDS[stage]?.[track]
  const qtyField = trackField || config.quantityField
  const isTrackedStage = !!config.tracks || !!DUAL_TRACK_FIELDS[stage]
  let stageLogs = logs.filter((l) => l.stage === stage)
  if (track && isTrackedStage) stageLogs = stageLogs.filter((l) => l.track === track)
  const totalRaw = stageLogs.reduce((sum, l) => sum + (Number(l[qtyField]) || 0), 0)
  const defects = stageLogs.reduce((sum, l) => sum + (Number(l.defects) || 0), 0)
  const total = SUBTRACT_DEFECTS_STAGES.has(stage) ? Math.max(0, totalRaw - defects) : totalRaw
  const percentage = targetQty > 0 ? Math.min(100, Math.round((total / targetQty) * 100)) : 0
  return { total, target: targetQty, percentage, isComplete: total >= targetQty }
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
    const totalRaw = trackLogs.reduce((sum, l) => sum + (Number(l[field]) || 0), 0)
    const defects = trackLogs.reduce((sum, l) => sum + (Number(l.defects) || 0), 0)
    const total = SUBTRACT_DEFECTS_STAGES.has(stage) ? Math.max(0, totalRaw - defects) : totalRaw
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
 * Если этап — первый количественный в маршруте (нет предыдущего этапа с qty-логом,
 * напр. `print`), возвращается `{ isStart: true, total: null }` — лимита по приходу нет
 * и подпись «Поступило на этап» не показывается: этот этап сам создаёт количество.
 *
 * @param {Array} logs
 * @param {string[]} route — ORDER_ROUTES для заказа
 * @param {string} stage
 * @param {number} targetQty
 * @param {string|null} track
 * @returns {{ total: number|null, source: string|null, isStart?: boolean }}
 */
export function computeIncoming(logs, route, stage, targetQty, track) {
  if (!route || !route.includes(stage)) return { total: null, source: null, isStart: true }
  const idx = route.indexOf(stage)
  if (idx <= 0) return { total: null, source: null, isStart: true }

  // Идём назад по маршруту до ближайшего этапа с qty-логом (skip 'new'/'design'/'prepress')
  for (let i = idx - 1; i >= 0; i--) {
    const prev = route[i]
    const cfg = STAGE_FIELDS[prev]
    if (!cfg) continue
    // На предыдущем этапе считаем по его quantityField и трек-фильтру.
    // Strict track filter — если track задан, ищем ИМЕННО его (фидбэк 17.05).
    // Раньше пропускался `!l.track || l.track === track`, что случайно работало
    // только потому что на dual-track-этапах все логи имели явный track.
    // Для dual-track-этапов (print/cutting/selection_pouring) поле зависит от
    // трека — берём из DUAL_TRACK_FIELDS, иначе fallback на quantityField.
    const trackField = (track && DUAL_TRACK_FIELDS[prev]?.[track]) || null
    const prevQtyField = trackField || cfg.quantityField
    if (!prevQtyField) continue
    let stageLogs = logs.filter((l) => l.stage === prev)
    if (track) stageLogs = stageLogs.filter((l) => l.track === track)
    const produced = stageLogs.reduce((sum, l) => sum + (Number(l[prevQtyField]) || 0), 0)
    // Из «поступило» вычитаем брак на предыдущем этапе — нельзя пустить дальше больше чем годных.
    const prevDefects = stageLogs.reduce((sum, l) => sum + (Number(l.defects) || 0), 0)
    const total = Math.max(0, produced - prevDefects)
    if (produced > 0) return { total, source: prev, produced, defects: prevDefects }
  }
  // Не нашли предыдущего этапа с количественным логом → это стартовый этап производства.
  return { total: null, source: null, isStart: true }
}

/**
 * Поэвидовой incoming на 3D-стикерпаке: сколько стикеров вида `designIndex`
 * пришло с предыдущего этапа маршрута. Считаем строго по track='stickers' +
 * design_index, поле берём из DUAL_TRACK_FIELDS[prev].stickers (производимое
 * предыдущим этапом количественное поле для трека стикеров).
 *
 * Если предыдущего количественного этапа нет (стартовый stage, напр. print) —
 * возвращаем { isStart: true, total: null }.
 *
 * @returns {{ total: number|null, source: string|null, isStart?: boolean }}
 */
export function computeIncomingPerDesign(logs, route, stage, designIndex) {
  if (!route || !route.includes(stage)) return { total: null, source: null, isStart: true }
  const idx = route.indexOf(stage)
  if (idx <= 0) return { total: null, source: null, isStart: true }

  for (let i = idx - 1; i >= 0; i--) {
    const prev = route[i]
    const field = DUAL_TRACK_FIELDS[prev]?.stickers
    if (!field) continue
    const stageLogs = logs.filter(
      (l) => l.stage === prev && l.track === 'stickers' && l.design_index === designIndex,
    )
    const produced = stageLogs.reduce((s, l) => s + (Number(l[field]) || 0), 0)
    const defects = stageLogs.reduce((s, l) => s + (Number(l.defects) || 0), 0)
    if (produced > 0) {
      return { total: Math.max(0, produced - defects), source: prev, produced, defects }
    }
  }
  return { total: null, source: null, isStart: true }
}

/**
 * Validate a log entry for a given stage.
 *
 * Возвращает `null` если всё OK, либо `{ severity, message }`:
 *  • `severity='error'`  — блокирует submit (обязательные поля, отрицательные числа)
 *  • `severity='warning'` — разрешает submit, показывается как напоминание
 *                           (R15.1, бриф 04.06: «оставить как напоминание»)
 *
 * Лимита по тиражу заказа НЕТ (фидбэк 14.05): печать — стартовый этап,
 * вводится без ограничений; последующие этапы ограничены только количеством,
 * фактически поступившим на этап (`options.incoming`), а не тиражом `qty`.
 * Превышение прихода больше не блокирует submit — менеджер собирает паки
 * пока фоны ещё не все выбраны (#3 / #7 в брифе 04.06).
 *
 * @param {string} stage
 * @param {object} data
 * @param {object} [options]
 *   options.progress — {total, target} прогресс по quantityField (используется для «осталось»)
 *   options.incoming — {total, isStart} сколько пришло с предыдущего этапа.
 *     Если isStart=true или total==null — предупреждения нет (стартовый этап).
 *   options.allowOvershoot — снять предупреждение прихода (напр. для packaging)
 * @returns {{ severity: 'error' | 'warning', message: string } | null}
 */
export function validateLogEntry(stage, data, options = {}) {
  const config = STAGE_FIELDS[stage]
  if (!config) return { severity: 'error', message: 'Неизвестный этап' }

  const fields = config.fields || []
  for (const field of fields) {
    if (field.required && !data[field.key] && data[field.key] !== 0) {
      return { severity: 'error', message: `Заполните поле "${field.label}"` }
    }
    if (data[field.key] !== undefined && data[field.key] !== '') {
      const num = Number(data[field.key])
      if (isNaN(num) || num < 0) {
        return { severity: 'error', message: `"${field.label}" должно быть положительным числом` }
      }
    }
  }

  // R15.1 (бриф 04.06 #3/#7): лимит по приходу теперь WARNING, не блок.
  // Проверяем ТОЛЬКО основное value (config.quantityField); defects могут быть
  // любыми и не учитываются в лимите (фидбэк менеджера 18.05). Для стартового
  // этапа (isStart / total==null) предупреждения нет вовсе.
  const inc = options.incoming
  if (inc && !inc.isStart && inc.total != null && config.quantityField && !options.allowOvershoot) {
    const value = Number(data[config.quantityField] || 0)
    const alreadyConsumed = Number(options.progress?.total || 0)
    const available = Math.max(0, Number(inc.total || 0) - alreadyConsumed)
    if (value > available) {
      return {
        severity: 'warning',
        message: `На этап поступило ${inc.total} шт. Доступно ещё: ${available}`,
      }
    }
  }

  return null
}

// ============================================================================
// Параллельные подзадачи 3D-стикерпака (R7) — gate на advance без production_log.
// ============================================================================

// Маппинг status подзадачи на (stage, track) для проверки наличия лога.
// Если track в маппинге null — используется track самой подзадачи.
const SUBTASK_STATUS_TO_STAGE = {
  printing:   { stage: 'print',             track: null },
  laminating: { stage: 'lamination',        track: null },
  cutting:    { stage: 'cutting',           track: null },
  selecting:  { stage: 'selection_pouring', track: 'backgrounds' },
  pouring:    { stage: 'selection_pouring', track: 'stickers' },
}

/**
 * Есть ли хотя бы один production_log для подзадачи в её текущем статусе?
 * Возвращает true если можно advance, false если нужно сперва внести лог.
 * Для статусов pending/ready/cancelled gate'а нет (учёта на них не бывает).
 *
 * R14.5 (бриф 03.06): extra_stickers тоже должна проходить с учётом работы.
 * R14.7 (code-review 03.06): УБИРАЕМ gate для extra_stickers до тех пор пока
 * не появится UI flow для записи лога с track='extra_stickers'. Сейчас ни
 * ProductionLogForm, ни CurrentStageWidget этого track не пишут — gate был
 * вечно заблокирован, допечатка зависала в проде. Менеджер сам решает когда
 * жать «Завершить» (правка от 04.06 по реальному репро). Когда появится
 * ExtraStickerLogForm (per-design ввод в ExtraStickerBlock) — gate вернём.
 */
export function hasSubtaskLog(logs, track, subtaskStatus) {
  if (track === 'extra_stickers') return true
  const map = SUBTASK_STATUS_TO_STAGE[subtaskStatus]
  if (!map) return true
  const requiredTrack = map.track || track
  return (logs || []).some((l) => l.stage === map.stage && l.track === requiredTrack && !l.deleted_at)
}

/**
 * Сводка по 3D-заливке одного stickerpack3D заказа. По строке на каждый вид
 * стикера (design_index). Источники данных:
 *   - stage='print',             track='stickers' → stickers_printed
 *   - stage='selection_pouring', track='stickers' → stickers_good (хорошие), defects (брак)
 *
 * Запас 15% — Math.ceil(qty * 1.15). Излишки = good − qty (отрицательное → недостача).
 * % брака от произведённых = defects / (good + defects).
 * % излишков = surplus / qty.
 */
export function compute3DPouringReport(order, logs, designs) {
  const qty = Number(order?.qty || 0)
  const target15 = Math.ceil(qty * 1.15)
  const rows = []
  for (const d of (designs || [])) {
    const di = d.design_index
    const printLogs = (logs || []).filter(
      (l) => l.stage === 'print' && l.track === 'stickers' && l.design_index === di && !l.deleted_at,
    )
    const printed = printLogs.reduce((s, l) => s + Number(l.stickers_printed || 0), 0)

    const pourLogs = (logs || []).filter(
      (l) => l.stage === 'selection_pouring' && l.track === 'stickers' && l.design_index === di && !l.deleted_at,
    )
    const good = pourLogs.reduce((s, l) => s + Number(l.stickers_good || 0), 0)
    const defects = pourLogs.reduce((s, l) => s + Number(l.defects || 0), 0)

    const pouredRaw = good + defects
    const surplus = good - qty
    const denom = good + defects
    const defectsPct = denom > 0 ? (defects / denom) * 100 : 0
    const surplusPct = qty > 0 ? (surplus / qty) * 100 : 0

    rows.push({
      designIndex: di,
      designName: d.name || '',
      qtyTarget: qty,
      printed,
      target15,
      pouredRaw,
      defects,
      good,
      surplus,
      defectsPct,
      surplusPct,
    })
  }
  return rows
}
