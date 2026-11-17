// R25.7A (ТЗ 17.11, Фаза 7): реестр типов заказов и своих этапов.
//
// Листовой модуль (ничего не импортирует из constants.js — constants.js
// импортирует его): хранит загруженные из БД k24_order_types / k24_stage_defs
// и описывает сборку маршрута типа так же, как SQL-функция
// k24_build_route_snapshot (миграция 103):
//   голова v2 (без образца при head.sample=false, без препресса при
//   head.prepress=false) + production + хвост (упаковка, ТК, выдача,
//   доставка, готово).
//
// Пустой реестр (до загрузки / таблиц ещё нет) → getTypeDef() = null →
// getOrderRoute берёт маршрут из констант ORDER_ROUTES_V2.

// Голова маршрута v2 (ТЗ 1.2 / 7.2). Образец — три этапа вместе.
export const ROUTE_V2_HEAD_START = ['new', 'awaiting_payment', 'design', 'design_approval']
export const ROUTE_V2_SAMPLE_STAGES = ['sample_layout', 'sample_print', 'color_approval']
export const ROUTE_V2_PREPRESS_STAGES = ['prepress']
export const ROUTE_V2_HEAD = [...ROUTE_V2_HEAD_START, ...ROUTE_V2_SAMPLE_STAGES, ...ROUTE_V2_PREPRESS_STAGES]
// Хвост: упаковка обязательна (фаза 1), дальше ТК / выдача / доставка / готово.
export const ROUTE_V2_TAIL = ['otk', 'awaiting_pickup', 'delivery', 'done']
export const ROUTE_V2_TAIL_WITH_PACKAGING = ['packaging', ...ROUTE_V2_TAIL]

// Встроенные этапы, допустимые в производственной части типа (зеркало
// k24_validate_type_production, миграция 102).
export const BUILTIN_PRODUCTION_STAGES = ['print', 'lamination', 'cutting', 'selection', 'pouring', 'drying', 'assembly_3d']

/** Текущая версия формата route_snapshot. */
export const ROUTE_SNAPSHOT_VERSION = 1

let _types = new Map()
let _stages = new Map()

/**
 * Зарегистрировать реестр (store order-types после загрузки, тесты).
 * @param {{ types?: object[], stages?: object[] }} registry
 */
export function registerRouteRegistry({ types = [], stages = [] } = {}) {
  _types = new Map((types || []).filter((t) => t?.key).map((t) => [t.key, t]))
  _stages = new Map((stages || []).filter((s) => s?.key).map((s) => [s.key, s]))
}

/** Очистить реестр (logout, тесты). */
export function resetRouteRegistry() {
  _types = new Map()
  _stages = new Map()
}

export function hasRouteRegistry() {
  return _types.size > 0
}

/** Описание типа из реестра или null. */
export function getTypeDef(key) {
  if (!key) return null
  return _types.get(key) || null
}

/** Описание своего этапа (custom_<N>) из каталога или null. */
export function getStageDef(key) {
  if (!key) return null
  return _stages.get(key) || null
}

export function listTypeDefs() {
  return [..._types.values()]
}

export function listStageDefs() {
  return [..._stages.values()]
}

function asStageList(value) {
  return Array.isArray(value) ? value.filter((s) => typeof s === 'string') : null
}

/**
 * Полный маршрут типа ДО правил конкретного заказа — тот же порядок, что
 * snapshot.stages в k24_build_route_snapshot.
 * @returns {string[] | null} null — у описания нет корректной production.
 */
export function buildTypeStages(typeDef) {
  const production = asStageList(typeDef?.production)
  if (!production) return null
  const head = [...ROUTE_V2_HEAD_START]
  if (typeDef?.head?.sample !== false) head.push(...ROUTE_V2_SAMPLE_STAGES)
  if (typeDef?.head?.prepress !== false) head.push(...ROUTE_V2_PREPRESS_STAGES)
  return [...head, ...production, ...ROUTE_V2_TAIL_WITH_PACKAGING]
}

/** Снимок маршрута типа в формате k24_orders.route_snapshot (для тестов / предпросмотра). */
export function buildRouteSnapshot(typeDef, takenAt = null) {
  const stages = buildTypeStages(typeDef)
  if (!stages) return null
  return {
    v: ROUTE_SNAPSHOT_VERSION,
    type: typeDef.key,
    builtin: !!typeDef.is_builtin,
    is_set: !!typeDef.is_set,
    stages,
    production: asStageList(typeDef.production),
    rates: typeDef.is_builtin ? null : (typeDef.rates ?? null),
    taken_at: takenAt,
  }
}

/** Корректный ли снимок (формат v1, stages — непустой список строк). */
export function isValidRouteSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false
  if (Number(snapshot.v) !== ROUTE_SNAPSHOT_VERSION) return false
  const stages = asStageList(snapshot.stages)
  return !!stages && stages.length > 0 && stages.length === snapshot.stages.length
}

/**
 * Источник маршрута v2 заказа: снимок заказа → тип из реестра → null
 * (вызывающий берёт константы).
 * @returns {{ stages: string[], production: string[] | null, source: 'snapshot' | 'registry' } | null}
 */
export function resolveTypeRoute(order) {
  const snap = order?.route_snapshot
  if (isValidRouteSnapshot(snap)) {
    return { stages: snap.stages.slice(), production: asStageList(snap.production), source: 'snapshot' }
  }
  const def = getTypeDef(order?.order_type)
  const stages = def ? buildTypeStages(def) : null
  if (stages) return { stages, production: asStageList(def.production), source: 'registry' }
  return null
}
