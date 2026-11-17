import { getStageDef, isCustomStageKey, listActiveStageDefs } from '@/shared/lib/route-registry'
import { ORG_DEPARTMENTS } from '@/shared/lib/department-mapping'

// R25.7D (ТЗ 7.4): очередь своего этапа /production/stage/<ключ> на общем
// QueuePage. Конфиг — из каталога k24_stage_defs (название, отдел).

/** Путь очереди своего этапа. */
export function customStagePath(key) {
  return `/production/stage/${key}`
}

/**
 * Конфиг очереди своего этапа в формате QUEUE_CONFIG QueuePage
 * ({ title, subtitle, status }) или null (не свой этап / нет в каталоге).
 */
export function customQueueConfig(key) {
  if (!isCustomStageKey(key)) return null
  const def = getStageDef(key)
  if (!def) return null
  const dept = ORG_DEPARTMENTS.find((d) => d.id === def.department)
  return {
    title: def.name || key,
    subtitle: dept ? dept.label : 'Свой этап',
    status: key,
    custom: true,
  }
}

// Последний встроенный пункт меню отдела — свои этапы встают сразу после него.
const DEPT_ANCHOR_PATH = {
  sales: '/production/otk',
  prepress: '/production/prepress',
  print: '/production/cutting',
  '3d': '/production/drying',
  osk: '/production/otk',
}

/**
 * Пункты меню своих этапов с show_in_menu (неархивные) — вставляются в
 * NAV_ITEMS после последнего встроенного этапа своего отдела. Видимость —
 * по праву stage:<ключ> (Sidebar фильтрует по permission).
 * @param {object[]} navItems — NAV_ITEMS
 * @param {object[]} [stageDefs] — каталог (по умолчанию реестр)
 */
export function withCustomStageNavItems(navItems, stageDefs = listActiveStageDefs()) {
  const result = [...navItems]
  const lastInsertedFor = {}
  for (const def of stageDefs || []) {
    if (!isCustomStageKey(def?.key) || def.archived_at || def.show_in_menu === false) continue
    const item = {
      path: customStagePath(def.key),
      label: def.name || def.key,
      icon: 'Combine',
      roles: ['admin', 'manager'],
      permission: `stage:${def.key}`,
      customStage: def.key,
    }
    const anchor = lastInsertedFor[def.department] || DEPT_ANCHOR_PATH[def.department] || '/production/otk'
    const at = result.findIndex((i) => i.path === anchor)
    if (at < 0) result.push(item)
    else result.splice(at + 1, 0, item)
    lastInsertedFor[def.department] = item.path
  }
  return result
}
