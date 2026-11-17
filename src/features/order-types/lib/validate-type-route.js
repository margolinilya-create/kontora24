import {
  BUILTIN_PRODUCTION_STAGES, getStageDef, isCustomStageKey,
} from '@/shared/lib/route-registry'
import { getStatusMeta } from '@/shared/constants'

// R25.7C (ТЗ 7.2–7.3): проверка производственной части маршрута типа на
// клиенте — зеркало SQL k24_validate_type_production (миграция 102). Тексты
// ошибок совпадают с серверными (toast до отправки, сервер — последняя линия).

const label = (s) => getStatusMeta(s)?.label || s

/** Этап из каталога: встроенный этап цеха или свой этап из реестра. */
export function isKnownProductionStage(stage, stageExists = (k) => !!getStageDef(k)) {
  if (BUILTIN_PRODUCTION_STAGES.includes(stage)) return true
  return isCustomStageKey(stage) && stageExists(stage)
}

/**
 * @param {object} p
 * @param {string[]} p.production — производственная часть (без упаковки)
 * @param {string[][]} [p.lockedBlocks] — замки встроенного типа
 * @param {boolean} [p.isBuiltin]
 * @param {(key: string) => boolean} [p.stageExists] — свой этап есть в каталоге
 * @returns {string|null} текст ошибки или null
 */
export function validateTypeRoute({ production, lockedBlocks = [], isBuiltin = false, stageExists } = {}) {
  if (!Array.isArray(production)) return 'Маршрут типа должен быть списком этапов.'
  if (production.some((s) => typeof s !== 'string')) return 'Маршрут типа содержит некорректный этап.'

  // Ключи этапов существуют (встроенный этап цеха или свой этап из каталога).
  const bad = production.find((s) => !isKnownProductionStage(s, stageExists))
  if (bad) return `Этап «${bad}» нельзя поставить в производственную часть маршрута.`

  if (new Set(production).size !== production.length) return 'Этап повторяется в маршруте.'

  // «Сушка» только сразу после «Заливки» (таймер 36 ч и автопереход).
  const d = production.indexOf('drying')
  if (d >= 0 && (d === 0 || production[d - 1] !== 'pouring')) {
    return '«Сушка» может стоять только сразу после «Заливки».'
  }

  if (isBuiltin && (production.length === 0 || production[0] !== 'print')) {
    return 'У встроенного типа первым этапом производства должна быть «Печать».'
  }

  for (const block of lockedBlocks || []) {
    if (!Array.isArray(block) || block.length === 0) continue
    const pos = production.indexOf(block[0])
    if (pos < 0) return `Закреплённый этап «${block[0]}» нельзя убрать из маршрута.`
    for (let i = 1; i < block.length; i++) {
      if (production[pos + i] !== block[i]) {
        return `Закреплённые этапы (${block.join(' → ')}) должны идти подряд в исходном порядке.`
      }
    }
  }
  return null
}

/** Предупреждения (не блокируют сохранение). */
export function typeRouteWarnings(production) {
  const out = []
  if (Array.isArray(production) && production.length === 0) {
    out.push('У типа нет этапов цеха — заказ пойдёт сразу на упаковку.')
  }
  return out
}

/**
 * Разбить production на элементы конструктора: закреплённый блок — один
 * элемент (нельзя убрать или разделить), остальные этапы — по одному.
 * @returns {{ id: string, stages: string[], locked: boolean }[]}
 */
export function toRouteUnits(production, lockedBlocks = []) {
  const units = []
  const blocks = (lockedBlocks || []).filter((b) => Array.isArray(b) && b.length > 0)
  for (let i = 0; i < (production || []).length;) {
    const s = production[i]
    const block = blocks.find((b) => b[0] === s && b.every((x, j) => production[i + j] === x))
    if (block) {
      units.push({ id: `block:${block.join('+')}`, stages: [...block], locked: true })
      i += block.length
    } else {
      units.push({ id: `stage:${s}`, stages: [s], locked: false })
      i += 1
    }
  }
  return units
}

/** Обратно: элементы конструктора → production. */
export function fromRouteUnits(units) {
  return (units || []).flatMap((u) => u.stages)
}

/** Подпись элемента конструктора: «Выборка → Заливка → Сушка». */
export function routeUnitLabel(unit) {
  return unit.stages.map(label).join(' → ')
}

/**
 * Этапы, ставки которых настраиваются у своего типа: производство + упаковка
 * (как проверяет save_order_type).
 */
export function rateStagesFor(production) {
  return [...(production || []), 'packaging']
}

/**
 * Нормализовать таблицу ставок перед сохранением: пустые ставки убираются,
 * база «за стикер» только у набора; этапы вне маршрута отбрасываются.
 * @returns {object|null} null — ставок нет
 */
export function normalizeRates(rates, production, isSet) {
  const allowed = new Set(rateStagesFor(production))
  const out = {}
  for (const [stage, r] of Object.entries(rates || {})) {
    if (!allowed.has(stage)) continue
    const raw = r?.rate
    if (raw === '' || raw == null) continue
    const rate = Number(String(raw).replace(',', '.'))
    if (!Number.isFinite(rate) || rate < 0) continue
    out[stage] = { rate, base: isSet && r?.base === 'sticker' ? 'sticker' : 'item' }
  }
  return Object.keys(out).length ? out : null
}
