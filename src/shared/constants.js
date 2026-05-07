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
  const route = ORDER_ROUTES[order?.order_type] || ROUTE_REGULAR
  // Skip lamination if not needed
  if (!order?.need_lam) {
    return route.filter(s => s !== 'lamination')
  }
  return route
}

// Role permissions: which roles can advance FROM a given status
export const ROLE_STAGE_PERMISSIONS = {
  admin: true, // admin can advance any stage
  manager: true, // manager can advance any stage
  designer: ['design', 'prepress'],
  printer: ['prepress', 'print', 'lamination', 'cutting', 'selection_pouring', 'pouring', 'assembly_3d', 'packaging'],
  post_printer: ['selection_pouring', 'pouring', 'assembly_3d', 'packaging', 'cutting', 'lamination', 'print'],
}

function canAdvanceFrom(role, status) {
  const perms = ROLE_STAGE_PERMISSIONS[role]
  if (perms === true) return true
  return perms?.includes(status) || false
}

export function canWorkOnStage(role, stage) {
  const perms = ROLE_STAGE_PERMISSIONS[role]
  if (perms === true) return true
  return perms?.includes(stage) || false
}

// Admin and manager can cancel from any status
export const CAN_CANCEL_ROLES = ['admin', 'manager']

export function getNextStatus(role, currentStatus, order) {
  if (currentStatus === 'done' || currentStatus === 'cancelled') return undefined
  if (!canAdvanceFrom(role, currentStatus)) return undefined

  const route = getOrderRoute(order)
  const idx = route.indexOf(currentStatus)
  if (idx === -1 || idx === route.length - 1) return undefined
  return route[idx + 1]
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
  Holo: { label: 'Голографическая' },
  Gold: { label: 'Золотая' },
  Chrome: { label: 'Хром' },
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
export const SIZE_PRESETS = {
  A7: { width: 74, height: 105, label: 'A7' },
  A6: { width: 105, height: 148, label: 'A6' },
  A5: { width: 148, height: 210, label: 'A5' },
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

// --- Material types ---
export const MATERIAL_TYPES = {
  film: { label: 'Плёнка', unit: 'm2' },
  ink: { label: 'Краска', unit: 'ml' },
  lam_film: { label: 'Ламинация', unit: 'm2' },
  resin: { label: 'Смола', unit: 'g' },
  packaging_bag: { label: 'Упаковочный пакет', unit: 'шт' },
  box: { label: 'Коробка', unit: 'шт' },
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

export const NAV_ITEMS = [
  { path: '/', label: 'Главная', icon: 'LayoutDashboard', roles: ALL_ROLES },
  { path: '/orders', label: 'Заказы', icon: 'ShoppingCart', roles: ['admin', 'manager'] },
  { path: '/production', label: 'Производство', icon: 'Palette', roles: ['admin', 'manager'] },
  { path: '/production/design', label: 'Дизайн', icon: 'Palette', roles: ['admin', 'manager', 'designer'] },
  { path: '/production/prepress', label: 'Препресс', icon: 'FileCheck', roles: ['admin', 'manager', 'designer', 'printer'] },
  { path: '/production/print', label: 'Печать', icon: 'Printer', roles: ['admin', 'manager', 'printer'] },
  { path: '/production/lamination', label: 'Ламинация', icon: 'Layers', roles: ['admin', 'manager', 'printer'] },
  { path: '/production/cutting', label: 'Резка', icon: 'Scissors', roles: ['admin', 'manager', 'printer'] },
  { path: '/production/pouring', label: 'Заливка', icon: 'Droplets', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'] },
  { path: '/production/selection', label: 'Выборка / Заливка', icon: 'Combine', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'] },
  { path: '/production/assembly3d', label: 'Сборка 3D', icon: 'Hammer', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'] },
  { path: '/production/packaging', label: 'Упаковка', icon: 'Package', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'] },
  { path: '/production/otk', label: 'ОТК', icon: 'Crosshair', roles: ['admin', 'manager'] },
  { path: '/cabinet', label: 'Кабинет', icon: 'User', roles: ALL_ROLES },
  { path: '/warehouse', label: 'Склад', icon: 'Warehouse', roles: ['admin', 'manager'] },
  { path: '/clients', label: 'Клиенты', icon: 'Users', roles: ['admin', 'manager'] },
  { path: '/analytics', label: 'Аналитика', icon: 'BarChart3', roles: ['admin', 'manager'] },
  { path: '/reports', label: 'Отчёты', icon: 'FileText', roles: ['admin'] },
  { path: '/settings', label: 'Настройки', icon: 'Settings', roles: ['admin'] },
  { path: '/help', label: 'Справка', icon: 'HelpCircle', roles: ALL_ROLES },
]
