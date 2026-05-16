// --- Time constants (ms) ---
export const MS_PER_DAY = 86_400_000
export const MS_PER_HOUR = 3_600_000
export const MS_PER_MINUTE = 60_000

// --- Order statuses ---
// Color comes from the department palette (4 colors): purple — design,
// blue — print/lamination/cutting, orange — pouring, green — finish/done.
const _DEPT = {
  design:  'bg-dept-design/15 text-dept-design',
  print:   'bg-dept-print/15 text-dept-print',
  pouring: 'bg-dept-pouring/15 text-dept-pouring',
  finish:  'bg-dept-finish/15 text-dept-finish',
  info:    'bg-info/15 text-info',
  danger:  'bg-danger/15 text-danger',
}

export const ORDER_STATUSES = {
  new: { label: 'Новый', color: _DEPT.info, order: 0 },
  design: { label: 'Дизайн', color: _DEPT.design, order: 1 },
  prepress: { label: 'Препресс', color: _DEPT.design, order: 2 },
  print: { label: 'Печать', color: _DEPT.print, order: 3 },
  lamination: { label: 'Ламинация', color: _DEPT.print, order: 4 },
  cutting: { label: 'Резка', color: _DEPT.print, order: 5 },
  selection_pouring: { label: 'Выборка / Заливка', color: _DEPT.pouring, order: 6 },
  pouring: { label: 'Заливка', color: _DEPT.pouring, order: 7 },
  assembly_3d: { label: 'Сборка 3D', color: _DEPT.finish, order: 8 },
  packaging: { label: 'Упаковка', color: _DEPT.finish, order: 9 },
  otk: { label: 'ОТК / Выдача', color: _DEPT.finish, order: 10 },
  done: { label: 'Готово', color: _DEPT.finish, order: 11 },
  cancelled: { label: 'Отменён', color: _DEPT.danger, order: 12 },
}

// --- Order routes by type ---
// Regular: sticker_cut, sticker_kiss, stickerpack, rect, big
// lamination is skipped when need_lam=false
const ROUTE_REGULAR = ['new', 'design', 'prepress', 'print', 'lamination', 'cutting', 'packaging', 'otk', 'done']
const ROUTE_3D_STICKER = ['new', 'design', 'prepress', 'print', 'cutting', 'pouring', 'packaging', 'otk', 'done']
const ROUTE_3D_STICKERPACK = ['new', 'design', 'prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'assembly_3d', 'packaging', 'otk', 'done']

export const ORDER_ROUTES = {
  sticker_cut: ROUTE_REGULAR,
  sticker_kiss: ROUTE_REGULAR,
  stickerpack: ROUTE_REGULAR,
  sticker3D: ROUTE_3D_STICKER,
  stickerpack3D: ROUTE_3D_STICKERPACK,
  rect: ROUTE_REGULAR,
  big: ROUTE_REGULAR,
}

export const IS_3D_TYPE = (orderType) => orderType === 'sticker3D' || orderType === 'stickerpack3D'
export const IS_3D_STICKERPACK = (orderType) => orderType === 'stickerpack3D'

// Stages where stickerpack3D has two parallel tracks (backgrounds + stickers)
export const DUAL_TRACK_STAGES = ['print', 'cutting', 'selection_pouring']
// Stages where only backgrounds track applies (for stickerpack3D)
export const BACKGROUNDS_ONLY_STAGES = ['lamination']

export function isDualTrack(status, order) {
  return IS_3D_STICKERPACK(order?.order_type) && DUAL_TRACK_STAGES.includes(status)
}

// Get the route for an order based on its type
export function getOrderRoute(order) {
  let route = ORDER_ROUTES[order?.order_type] || ROUTE_REGULAR
  // Skip lamination if not needed
  if (!order?.need_lam) {
    route = route.filter(s => s !== 'lamination')
  }
  // Skip design when client provided the mockup (nothing to draw).
  if (order?.design_status === 'provided') {
    route = route.filter(s => s !== 'design')
  }
  // Skip packaging — нужен только для БОПП или 3D-стикерпака (по ТЗ 11.05).
  const needsPackaging = order?.bopp_bag === true || order?.order_type === 'stickerpack3D'
  if (!needsPackaging) {
    route = route.filter(s => s !== 'packaging')
  }
  return route
}

// Whether a stage is part of the order's effective route.
// Used for DnD validation in the kanban and for the server-side guard in updateOrderStatus.
export function isStageAllowed(order, stage) {
  if (!order || !stage) return false
  return getOrderRoute(order).includes(stage)
}

// --- L2 RBAC: динамические разрешения (через k24_role_permissions) ---
// Полный список доступных прав. Используется в UI редактора и для валидации.
// Значения соответствуют записям в k24_role_permissions.
export const PERMISSIONS = {
  stages: [
    'stage:design', 'stage:prepress', 'stage:print', 'stage:lamination',
    'stage:cutting', 'stage:pouring', 'stage:selection_pouring',
    'stage:assembly_3d', 'stage:packaging', 'stage:otk',
  ],
  views: [
    'view:dashboard', 'view:analytics', 'view:finance',
    'view:warehouse', 'view:reports', 'view:settings',
  ],
  actions: [
    'order:create', 'order:edit', 'order:cancel',
    'material:manage', 'user:manage',
  ],
}

export const PERMISSION_LABELS = {
  'stage:design': 'Продвигать «Дизайн»',
  'stage:prepress': 'Продвигать «Препресс»',
  'stage:print': 'Продвигать «Печать»',
  'stage:lamination': 'Продвигать «Ламинация»',
  'stage:cutting': 'Продвигать «Резка»',
  'stage:pouring': 'Продвигать «Заливка»',
  'stage:selection_pouring': 'Продвигать «Выборка/Заливка»',
  'stage:assembly_3d': 'Продвигать «Сборка 3D»',
  'stage:packaging': 'Продвигать «Упаковка»',
  'stage:otk': 'Продвигать «ОТК»',
  'view:dashboard': 'Видеть «Главная»',
  'view:analytics': 'Видеть «Аналитика»',
  'view:finance': 'Видеть финансы (цены, маржа)',
  'view:warehouse': 'Видеть «Склад»',
  'view:reports': 'Видеть «Отчёты»',
  'view:settings': 'Видеть «Настройки»',
  'order:create': 'Создавать заказы',
  'order:edit': 'Редактировать заказы',
  'order:cancel': 'Отменять заказы',
  'material:manage': 'Управлять складом',
  'user:manage': 'Управлять пользователями',
}

// Legacy: hard-coded fallback. Используется до загрузки динамических прав
// и в местах где невозможен async-вызов (например, server-side seed).
// Role permissions: which roles can advance FROM a given status
export const ROLE_STAGE_PERMISSIONS = {
  admin: true, // admin can advance any stage
  manager: true, // manager can advance any stage
  designer: ['design', 'prepress'],
  printer: ['prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'pouring', 'assembly_3d', 'packaging'],
  post_printer: ['selection_pouring', 'pouring', 'assembly_3d', 'packaging', 'cutting', 'lamination', 'print'],
}

// L2 RBAC: если dynamicPerms передан (загружен из k24_role_permissions) — он
// является источником правды и перекрывает статический ROLE_STAGE_PERMISSIONS.
// Без него (в тестах / до загрузки стора) используется статика как fallback.
// Формат dynamicPerms: { [role]: Set<permission> } (см. role-permissions-store.js).
export function canAdvanceFrom(role, status, dynamicPerms = null) {
  if (!role) return false
  if (dynamicPerms && dynamicPerms[role]) {
    return dynamicPerms[role].has(`stage:${status}`)
  }
  const perms = ROLE_STAGE_PERMISSIONS[role]
  if (perms === true) return true
  return perms?.includes(status) || false
}

export function canWorkOnStage(role, stage, dynamicPerms = null) {
  if (!role) return false
  if (dynamicPerms && dynamicPerms[role]) {
    return dynamicPerms[role].has(`stage:${stage}`)
  }
  const perms = ROLE_STAGE_PERMISSIONS[role]
  if (perms === true) return true
  return perms?.includes(stage) || false
}

// Admin and manager can cancel from any status
export const CAN_CANCEL_ROLES = ['admin', 'manager']

export function getNextStatus(role, currentStatus, order, dynamicPerms = null) {
  if (currentStatus === 'done' || currentStatus === 'cancelled') return undefined
  if (!canAdvanceFrom(role, currentStatus, dynamicPerms)) return undefined

  const route = getOrderRoute(order)
  const idx = route.indexOf(currentStatus)
  if (idx === route.length - 1) return undefined
  if (idx !== -1) return route[idx + 1]

  // currentStatus вне маршрута (заказ оказался на стадии, которую новый маршрут пропускает —
  // напр. сменили design_status='provided' когда заказ уже в design). Возвращаем
  // ближайший статус маршрута впереди по каноническому порядку, чтобы кнопка «следующий» работала.
  const currentOrder = ORDER_STATUSES[currentStatus]?.order ?? -1
  const next = route.find(s => (ORDER_STATUSES[s]?.order ?? -1) > currentOrder)
  return next ?? route[0]
}

// --- Order types ---
export const ORDER_TYPES = {
  sticker_cut: { label: 'Стикер вырубной (die cut)' },
  sticker_kiss: { label: 'Стикер на подложке (kiss cut)' },
  stickerpack: { label: 'Стикерпак' },
  sticker3D: { label: '3D стикер' },
  stickerpack3D: { label: '3D стикерпак' },
  rect: { label: 'Прямоугольный' },
  big: { label: 'Большой формат' },
}

// --- Lamination types ---
export const LAMINATION_TYPES = {
  matte: { label: 'Матовая' },
  glossy: { label: 'Глянцевая' },
}

// --- Film types ---
export const FILM_TYPES = {
  G: { label: 'Глянцевая (G)' },
  M: { label: 'Матовая (M)' },
  Transparent_G: { label: 'Прозрачная глянцевая' },
  Transparent_M: { label: 'Прозрачная матовая' },
  Holo: { label: 'Голографическая' },
  Gold: { label: 'Золотая' },
  Chrome: { label: 'Хром' },
}

// «Человеческое» имя плёнки для тех-карты (соответствует строкам прайс-листа MATERIAL_COSTS).
export const FILM_TYPE_TO_MATERIAL_NAME = {
  G: 'Белая глянцевая (Duckson 1260)',
  M: 'Белая матовая (Duckson 1260)',
  Transparent_G: 'Прозрачная глянцевая (Dickson 1260)',
  Transparent_M: 'Прозрачная матовая (Dickson 1260)',
  Holo: 'Голография (1220)',
  Gold: 'Oracal 352 Золото',
  Chrome: 'Oracal 352 Серебро',
}

export function getFilmMaterialName(filmType) {
  if (!filmType) return '—'
  return FILM_TYPE_TO_MATERIAL_NAME[filmType] || FILM_TYPES[filmType]?.label || filmType
}

// --- Order sources ---
export const ORDER_SOURCES = {
  referrer: { label: 'Референт' },
  avito: { label: 'Авито' },
  website: { label: 'Сайт' },
  word_of_mouth: { label: 'Сарафан' },
  repeat: { label: 'Повторный заказ' },
  other: { label: 'Другой' },
}

// --- Payment statuses ---
export const PAYMENT_STATUSES = {
  not_paid: { label: 'Не оплачено' },
  sbp_tochka: { label: 'СБП (Точка)' },
  ip_chikrizov_vtb: { label: 'ИП Чикризов (ВТБ)' },
  pinhead_fabrika: { label: 'Пинхед Фабрика' },
  aventa: { label: 'Авента' },
  pinhead_studio: { label: 'Пинхед студия' },
  cash: { label: 'Нал' },
  barter: { label: 'Бартер' },
}

// --- Delivery types ---
export const DELIVERY_TYPES = {
  pickup: { label: 'Самовывоз' },
  delivery: { label: 'Доставка' },
}

// --- Design statuses ---
export const DESIGN_STATUSES = {
  provided: { label: 'Предоставлен заказчиком' },
  needs_development: { label: 'Требуется разработка' },
}

// --- Quick size presets ---
// `kind: 'square'` — квадратные пресеты, не показываются для стикерпаков
// (там размер = размер всего пака, не отдельного стикера).
export const SIZE_PRESETS = {
  S25: { width: 25, height: 25, label: '25', kind: 'square' },
  S30: { width: 30, height: 30, label: '30', kind: 'square' },
  S35: { width: 35, height: 35, label: '35', kind: 'square' },
  S40: { width: 40, height: 40, label: '40', kind: 'square' },
  A7: { width: 74, height: 105, label: 'A7', kind: 'sheet' },
  A6: { width: 105, height: 148, label: 'A6', kind: 'sheet' },
  A5: { width: 148, height: 210, label: 'A5', kind: 'sheet' },
}

// --- Material costs (себестоимость по ТЗ 06.05) ---
// Цены за 1 пог. м плёнки (или 1 г для смолы). Источник — ручной список менеджера;
// в будущем переедут в БД с UI редактирования.
export const MATERIAL_COSTS = [
  { name: 'Duckson белая 3640 (Матовая)', spec: 'Ширина 1,26 м', unit: 'руб/пог.м', value: 130 },
  { name: 'Duckson белая 3640 (Глянцевая)', spec: 'Ширина 1,26 м', unit: 'руб/пог.м', value: 130 },
  { name: 'Dickson прозр. 3640 (Матовая)', spec: 'Ширина 1,26 м', unit: 'руб/пог.м', value: 130 },
  { name: 'Dickson прозр. 3640 (Глянцевая)', spec: 'Ширина 1,26 м', unit: 'руб/пог.м', value: 130 },
  { name: 'Orajet 3640 бел. (Глянцевая)', spec: 'Ширина 1,26 м', unit: 'руб/пог.м', value: 235 },
  { name: 'Orajet 3640 бел. (Матовая)', spec: 'Ширина 1,26 м', unit: 'руб/пог.м', value: 235 },
  { name: 'Orajet 3640 прозр. (Глянцевая)', spec: 'Ширина 1,26 м', unit: 'руб/пог.м', value: 235 },
  { name: 'Orajet 3640 прозр. (Матовая)', spec: 'Ширина 1,26 м', unit: 'руб/пог.м', value: 235 },
  { name: 'Голография', spec: 'Ширина 1,22 м', unit: 'руб/пог.м', value: 240 },
  { name: 'Oracal 352 Золото', spec: 'Ширина 1 м', unit: 'руб/пог.м', value: 670 },
  { name: 'Oracal 352 Серебро', spec: 'Ширина 1 м', unit: 'руб/пог.м', value: 555 },
  { name: 'Смола ПУ КДР', spec: '—', unit: 'руб/г', value: 2.35 },
]

// Mapping film_type (k24_orders/k24_production_logs) → имя позиции в MATERIAL_COSTS.
// Используется для расчёта фактической себестоимости из production logs.
const FILM_TYPE_TO_COST_NAME = {
  G: 'Duckson белая 3640 (Глянцевая)',
  M: 'Duckson белая 3640 (Матовая)',
  Transparent_G: 'Dickson прозр. 3640 (Глянцевая)',
  Transparent_M: 'Dickson прозр. 3640 (Матовая)',
  Holo: 'Голография',
  Gold: 'Oracal 352 Золото',
  Chrome: 'Oracal 352 Серебро',
}

export function getFilmCostPerMeter(filmType) {
  const name = FILM_TYPE_TO_COST_NAME[filmType]
  if (!name) return 0
  return MATERIAL_COSTS.find((m) => m.name === name)?.value || 0
}

export const RESIN_COST_PER_GRAM = MATERIAL_COSTS.find((m) => m.name === 'Смола ПУ КДР')?.value || 0

// Расчёт фактической себестоимости материалов из production logs.
// film_meters суммируются по film_type (если указан), resin_grams — общим итогом.
// Если в логе нет film_type — используется order.film_type как fallback.
export function calculateActualMaterialsCost(logs, fallbackFilmType) {
  if (!Array.isArray(logs)) return { films: {}, filmsTotal: 0, resinGrams: 0, resinCost: 0, total: 0 }
  const films = {}
  let resinGrams = 0
  for (const log of logs) {
    const meters = Number(log.film_meters) || 0
    const lamMeters = Number(log.lamination_meters) || 0
    if (meters > 0) {
      const ft = log.film_type || fallbackFilmType
      if (ft) films[ft] = (films[ft] || 0) + meters
    }
    // Ламинация — отдельная статья, но в текущей модели цены ламинации идут общими 130 руб/м (можно уточнить позже)
    if (lamMeters > 0) {
      films['__lamination__'] = (films['__lamination__'] || 0) + lamMeters
    }
    resinGrams += Number(log.resin_grams) || 0
  }
  let filmsTotal = 0
  for (const [ft, m] of Object.entries(films)) {
    if (ft === '__lamination__') filmsTotal += m * 130
    else filmsTotal += m * getFilmCostPerMeter(ft)
  }
  const resinCost = resinGrams * RESIN_COST_PER_GRAM
  return { films, filmsTotal, resinGrams, resinCost, total: filmsTotal + resinCost }
}

// --- Priorities ---
export const PRIORITIES = {
  low: { label: 'Низкий', color: 'bg-text-muted/15 text-text-muted', sortOrder: 0 },
  normal: { label: 'Обычный', color: 'bg-info/15 text-info', sortOrder: 1 },
  high: { label: 'Высокий', color: 'bg-dept-pouring/15 text-dept-pouring', sortOrder: 2 },
  urgent: { label: 'Срочный', color: 'bg-danger/15 text-danger', sortOrder: 3 },
}

// --- Roles ---
export const ROLES = {
  admin: { label: 'Администратор', color: 'bg-danger/15 text-danger' },
  manager: { label: 'Менеджер', color: 'bg-info/15 text-info' },
  designer: { label: 'Дизайнер', color: 'bg-dept-design/15 text-dept-design' },
  printer: { label: 'Печатник', color: 'bg-dept-print/15 text-dept-print' },
  post_printer: { label: 'Постпечатник', color: 'bg-dept-pouring/15 text-dept-pouring' },
}

// --- Material types (БД: k24_materials.type) ---
export const MATERIAL_TYPES = {
  film: { label: 'Плёнка', unit: 'm2' },
  ink: { label: 'Краска', unit: 'ml' },
  lam_film: { label: 'Ламинация', unit: 'm2' },
  resin: { label: 'Смола (с отвердителем)', unit: 'g' },
  packaging_bag: { label: 'Упаковочный пакет', unit: 'шт' },
  box: { label: 'Коробка', unit: 'шт' },
  utensils: { label: 'Утварь', unit: 'шт' },
  household: { label: 'Хоз. товары', unit: 'шт' },
}

// --- Material categories (UI группировка по аудиту 8.05) ---
// Старое поле `type` в БД остаётся как есть; категория — это UI-группа,
// определяемая по type или по имени материала (для пакетов БОПП — по ширине).
export const MATERIAL_CATEGORIES = {
  film_print: { label: 'Плёнка для печати' },
  film_lam: { label: 'Плёнка для ламинации' },
  chemicals: { label: 'Химические вещества' },
  utensils: { label: 'Утварь' },
  packaging: { label: 'Упаковка (коробки)' },
  bopp_wide: { label: 'БОПП пакеты ширина >100 мм' },
  bopp_narrow: { label: 'БОПП пакеты ширина ≤100 мм' },
  household: { label: 'Хоз. товары' },
}

/**
 * Определить UI-категорию материала по type и name.
 * Используется в табличном виде склада с фильтрацией.
 */
export function getMaterialCategory(material) {
  if (!material) return null
  const type = material.type
  const name = (material.name || '').toLowerCase()
  if (type === 'film') return 'film_print'
  if (type === 'lam_film') return 'film_lam'
  if (type === 'utensils') return 'utensils'
  if (type === 'household') return 'household'
  if (type === 'resin' || type === 'ink' || /смола|отвердитель|клей|газ/i.test(name)) return 'chemicals'
  if (/шприц|стаканч|ватн.*палочк/i.test(name)) return 'utensils'
  if (type === 'box' || /короб/i.test(name)) return 'packaging'
  if (type === 'packaging_bag' || /бопп|пакет/i.test(name)) {
    // По ширине из имени: ищем число перед 'x' или 'х'
    const m = name.match(/(\d+)\s*[x×х]/)
    if (m) {
      const width = parseInt(m[1], 10)
      if (!isNaN(width)) return width > 100 ? 'bopp_wide' : 'bopp_narrow'
    }
    return 'bopp_wide' // fallback
  }
  if (/растворитель|полотенц|салфетк|скотч|термоплёнк/i.test(name)) return 'household'
  return 'utensils' // fallback для неклассифицированного
}

/**
 * Определить статус остатка: достаточно / мало / закончилось.
 */
export function getStockStatus(material) {
  const stock = Number(material?.stock_qty) || 0
  const min = Number(material?.min_qty) || 0
  if (stock <= 0) return { key: 'empty', label: 'Закончилось', color: 'bg-danger/15 text-danger' }
  if (min > 0 && stock <= min) return { key: 'low', label: 'Мало', color: 'bg-warning/20 text-warning' }
  return { key: 'ok', label: 'Достаточно', color: 'bg-success/15 text-success' }
}

// --- Worker payout rates (₽ за единицу) — по аудиту 8.05 ---
// Используется в личном кабинете для расчёта потенциального заработка
// на основе production logs.
export const WORKER_RATES = {
  pouring_per_sticker:  1.0,  // заливка одного стикера (хорошего)
  selection_per_sticker: 0.5, // выборка фона, оплачивается как qty_selected × stickers_per_pack × 0.5 (фидбэк 17.05)
  assembly_per_pack:    0.5,  // сборка одного пака, считаем по стикерам в паке
  packaging_per_pack:   1.5,  // упаковка одного пака
}

/**
 * Подсчитать заработок работника из массива production logs.
 *
 * @param {Array} logs — записи k24_production_logs (могут содержать связанный order через order_id/order)
 * @param {object} [opts]
 * @param {object} [opts.ordersById] — карта { [order_id]: order } чтобы достать stickers_per_pack
 * @returns {{ breakdown: object, total: number }}
 *
 * Формула сборки 3D обновлена 12.05: packs_assembled × stickers_per_pack × 0,5 ₽.
 * Формула выборки фонов обновлена 17.05: qty_selected × stickers_per_pack × 0,5 ₽
 * (раньше была фиксированная ставка за фон без учёта что к каждому фону относятся
 * stickers_per_pack стикеров).
 */
export function calculateWorkerPayout(logs, opts = {}) {
  let pouring = 0, packaging = 0
  // Выборку и сборку считаем в «стикерах», чтобы умножить на ставку 0.5 ₽/стикер.
  let selectionStickers = 0
  let assemblyStickers = 0
  // Для отчётности храним сырые counts тоже
  let selectionBgs = 0
  let assemblyPacks = 0

  for (const l of logs || []) {
    if (l.stage === 'pouring') {
      pouring += Number(l.stickers_good) || 0
    }
    if (l.stage === 'selection_pouring') {
      const bgs = Number(l.qty_selected) || 0
      selectionBgs += bgs
      const order = opts.ordersById?.[l.order_id] || l.order || null
      const perPack = Number(order?.stickers_per_pack) || 1
      selectionStickers += bgs * perPack
      pouring += Number(l.stickers_good) || 0
    }
    if (l.stage === 'assembly_3d') {
      const packs = Number(l.packs_assembled) || 0
      assemblyPacks += packs
      const order = opts.ordersById?.[l.order_id] || l.order || null
      const perPack = Number(order?.stickers_per_pack) || 1
      assemblyStickers += packs * perPack
    }
    if (l.stage === 'packaging') {
      packaging += Number(l.packs_packaged) || 0
    }
  }
  const breakdown = {
    pouring:    { count: pouring,           rate: WORKER_RATES.pouring_per_sticker,   amount: pouring           * WORKER_RATES.pouring_per_sticker,   label: 'Заливка стикеров' },
    selection:  { count: selectionStickers, rate: WORKER_RATES.selection_per_sticker, amount: selectionStickers * WORKER_RATES.selection_per_sticker, label: 'Выборка фонов', bgs: selectionBgs },
    assembly:   { count: assemblyStickers,  rate: WORKER_RATES.assembly_per_pack,     amount: assemblyStickers  * WORKER_RATES.assembly_per_pack,     label: 'Сборка 3D-паков', packs: assemblyPacks },
    packaging:  { count: packaging,         rate: WORKER_RATES.packaging_per_pack,    amount: packaging         * WORKER_RATES.packaging_per_pack,    label: 'Упаковка паков' },
  }
  const total = breakdown.pouring.amount + breakdown.selection.amount + breakdown.assembly.amount + breakdown.packaging.amount
  return { breakdown, total }
}

// --- Operation checklists by order type ---
export const OPERATION_CHECKLISTS = {
  sticker_cut: ['Препресс', 'Печать', 'Резка по контуру', 'Проверка качества'],
  sticker_kiss: ['Препресс', 'Печать', 'Высечка', 'Проверка качества'],
  stickerpack: ['Препресс', 'Печать', 'Ламинация', 'Резка', 'Проверка качества'],
  sticker3D: ['Препресс', 'Печать', 'Резка', 'Заливка смолой', 'Проверка качества'],
  stickerpack3D: ['Препресс', 'Печать фонов', 'Печать стикеров', 'Ламинация фонов', 'Резка', 'Выборка фонов', 'Заливка стикеров', 'Сборка 3D', 'Проверка качества'],
  rect: ['Препресс', 'Печать', 'Резка', 'Проверка качества'],
  big: ['Препресс', 'Печать', 'Ламинация', 'Проверка качества'],
}

// --- Stage notification roles: when order enters status, notify these roles ---
export const NOTIFY_ROLES = {
  design: ['designer'],
  prepress: ['designer', 'printer'],
  print: ['printer'],
  lamination: ['printer'],
  cutting: ['printer'],
  selection_pouring: ['post_printer'],
  pouring: ['post_printer'],
  assembly_3d: ['post_printer'],
  packaging: ['post_printer'],
  otk: ['manager'],
}

// --- Navigation ---
const ALL_ROLES = ['admin', 'manager', 'designer', 'printer', 'post_printer']
const MANAGER_ROLES = ['admin', 'manager']

// NAV_ITEMS: `roles` — legacy fallback (до загрузки динамических прав).
// `permission` — L2 RBAC проверка через k24_role_permissions (приоритет).
// Если permission задан — Sidebar/AuthGuard используют canRoleDo(role, permission).
export const NAV_ITEMS = [
  { path: '/', label: 'Главная', icon: 'LayoutDashboard', roles: MANAGER_ROLES, permission: 'view:dashboard' },
  { path: '/orders', label: 'Заказы', icon: 'ShoppingCart', roles: ALL_ROLES }, // доступен всем (без permission)
  { path: '/production/design', label: 'Дизайн', icon: 'Palette', roles: ['admin', 'manager', 'designer'], permission: 'stage:design' },
  { path: '/production/prepress', label: 'Препресс', icon: 'FileCheck', roles: ['admin', 'manager', 'designer', 'printer'], permission: 'stage:prepress' },
  { path: '/production/print', label: 'Печать', icon: 'Printer', roles: ['admin', 'manager', 'printer'], permission: 'stage:print' },
  { path: '/production/lamination', label: 'Ламинация', icon: 'Layers', roles: ['admin', 'manager', 'printer'], permission: 'stage:lamination' },
  { path: '/production/cutting', label: 'Резка', icon: 'Scissors', roles: ['admin', 'manager', 'printer'], permission: 'stage:cutting' },
  { path: '/production/pouring', label: 'Заливка', icon: 'Droplets', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'], permission: 'stage:pouring' },
  { path: '/production/selection', label: 'Выборка / Заливка', icon: 'Combine', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'], permission: 'stage:selection_pouring' },
  { path: '/production/assembly3d', label: 'Сборка 3D', icon: 'Hammer', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'], permission: 'stage:assembly_3d' },
  { path: '/production/packaging', label: 'Упаковка', icon: 'Package', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'], permission: 'stage:packaging' },
  { path: '/production/otk', label: 'ОТК', icon: 'Crosshair', roles: ['admin', 'manager'], permission: 'stage:otk' },
  { path: '/cabinet', label: 'Кабинет', icon: 'User', roles: ALL_ROLES }, // личный кабинет — всем
  { path: '/warehouse', label: 'Склад', icon: 'Warehouse', roles: MANAGER_ROLES, permission: 'view:warehouse' },
  { path: '/analytics', label: 'Аналитика', icon: 'BarChart3', roles: MANAGER_ROLES, permission: 'view:analytics' },
  { path: '/reports', label: 'Отчёты', icon: 'FileText', roles: ['admin'], permission: 'view:reports' },
  { path: '/settings', label: 'Настройки', icon: 'Settings', roles: ['admin'], permission: 'view:settings' },
  { path: '/help', label: 'Справка', icon: 'HelpCircle', roles: ALL_ROLES },
]
