// --- Order statuses ---
export const ORDER_STATUSES = {
  new: { label: 'Новый', color: 'bg-blue-500/15 text-blue-400', order: 0 },
  design: { label: 'Дизайн', color: 'bg-purple-500/15 text-purple-400', order: 1 },
  design_done: { label: 'Дизайн готов', color: 'bg-purple-500/15 text-purple-400', order: 2 },
  print: { label: 'Печать', color: 'bg-orange-500/15 text-orange-400', order: 3 },
  print_done: { label: 'Напечатано', color: 'bg-orange-500/15 text-orange-400', order: 4 },
  resin_pouring: { label: 'Заливка смолой', color: 'bg-cyan-500/15 text-cyan-400', order: 5 },
  assembly: { label: 'Сборка', color: 'bg-yellow-500/15 text-yellow-400', order: 6 },
  done: { label: 'Готово', color: 'bg-green-500/15 text-green-400', order: 7 },
  cancelled: { label: 'Отменён', color: 'bg-red-500/15 text-red-400', order: 8 },
}

// Status transitions per role
export const STATUS_TRANSITIONS = {
  admin: { new: 'design', design: 'design_done', design_done: 'print', print: 'print_done', print_done: 'assembly', resin_pouring: 'assembly', assembly: 'done' },
  manager: { new: 'design', design_done: 'print', print_done: 'assembly' },
  designer: { design: 'design_done' },
  printer: { print: 'print_done' },
  assembler: { assembly: 'done' },
  resin_pourer: { resin_pouring: 'assembly' },
}

// Admin and manager can cancel from any status
export const CAN_CANCEL_ROLES = ['admin', 'manager']

export const IS_3D_TYPE = (orderType) => orderType === 'sticker3D' || orderType === 'stickerpack3D'

export function getNextStatus(role, currentStatus, order) {
  // 3D orders: print_done → resin_pouring instead of assembly
  if (currentStatus === 'print_done' && IS_3D_TYPE(order?.order_type)) {
    if (['admin', 'manager'].includes(role)) return 'resin_pouring'
  }
  // Resin pouring → assembly
  if (currentStatus === 'resin_pouring') {
    if (['admin', 'manager', 'assembler', 'resin_pourer'].includes(role)) return 'assembly'
  }
  return STATUS_TRANSITIONS[role]?.[currentStatus]
}

// --- Order types ---
export const ORDER_TYPES = {
  sticker_cut: { label: 'Стикер (вырезка)', markup: 4.0 },
  sticker_kiss: { label: 'Стикер (поцелуйка)', markup: 4.0 },
  stickerpack: { label: 'Стикерпак', markup: 4.0 },
  sticker3D: { label: '3D стикер', markup: 4.5 },
  stickerpack3D: { label: '3D стикерпак', markup: 4.5 },
  rect: { label: 'Прямоугольный', markup: 4.0 },
  big: { label: 'Большой формат', markup: 4.0 },
}

// --- Priorities ---
export const PRIORITIES = {
  low: { label: 'Низкий', color: 'bg-gray-500/15 text-gray-400', sortOrder: 0 },
  normal: { label: 'Обычный', color: 'bg-blue-500/15 text-blue-400', sortOrder: 1 },
  high: { label: 'Высокий', color: 'bg-orange-500/15 text-orange-400', sortOrder: 2 },
  urgent: { label: 'Срочный', color: 'bg-red-500/15 text-red-400', sortOrder: 3 },
}

// --- Roles ---
export const ROLES = {
  admin: { label: 'Администратор', color: 'bg-red-500/15 text-red-400' },
  manager: { label: 'Менеджер', color: 'bg-blue-500/15 text-blue-400' },
  designer: { label: 'Дизайнер', color: 'bg-purple-500/15 text-purple-400' },
  printer: { label: 'Печатник', color: 'bg-orange-500/15 text-orange-400' },
  assembler: { label: 'Сборщик', color: 'bg-yellow-500/15 text-yellow-400' },
  resin_pourer: { label: 'Заливщик', color: 'bg-cyan-500/15 text-cyan-400' },
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
  sticker_cut: ['Печать', 'Резка по контуру', 'Упаковка'],
  sticker_kiss: ['Печать', 'Высечка', 'Упаковка'],
  stickerpack: ['Печать', 'Резка', 'Ламинация', 'Сборка в пак', 'Упаковка'],
  sticker3D: ['Печать', 'Резка', 'Заливка смолой', 'Сушка', 'Упаковка'],
  stickerpack3D: ['Печать', 'Резка', 'Заливка смолой', 'Сушка', 'Сборка в пак', 'Упаковка'],
  rect: ['Печать', 'Резка', 'Упаковка'],
  big: ['Печать', 'Ламинация', 'Упаковка'],
}

// --- Volume discounts ---
export const VOLUME_DISCOUNTS = [
  { min: 1, max: 9, discount: 0 },
  { min: 10, max: 24, discount: 0.05 },
  { min: 25, max: 49, discount: 0.10 },
  { min: 50, max: 99, discount: 0.15 },
  { min: 100, max: 199, discount: 0.20 },
  { min: 200, max: 499, discount: 0.25 },
  { min: 500, max: Infinity, discount: 0.30 },
]

// --- Navigation ---
export const NAV_ITEMS = [
  { path: '/', label: 'Главная', icon: 'LayoutDashboard', roles: ['admin', 'manager', 'designer', 'printer', 'assembler', 'resin_pourer'] },
  { path: '/orders', label: 'Заказы', icon: 'ShoppingCart', roles: ['admin', 'manager'] },
  { path: '/calculator', label: 'Калькулятор', icon: 'Calculator', roles: ['admin', 'manager'] },
  { path: '/production', label: 'Производство', icon: 'Palette', roles: ['admin', 'manager'] },
  { path: '/production/design', label: 'Дизайн', icon: 'Palette', roles: ['admin', 'manager', 'designer'] },
  { path: '/production/print', label: 'Печать', icon: 'Printer', roles: ['admin', 'manager', 'printer'] },
  { path: '/production/assembly', label: 'Сборка', icon: 'Hammer', roles: ['admin', 'manager', 'assembler'] },
  { path: '/production/resin', label: 'Заливка', icon: 'Droplets', roles: ['admin', 'manager', 'assembler', 'resin_pourer'] },
  { path: '/warehouse', label: 'Склад', icon: 'Warehouse', roles: ['admin', 'manager'] },
  { path: '/clients', label: 'Клиенты', icon: 'Users', roles: ['admin', 'manager'] },
  { path: '/analytics', label: 'Аналитика', icon: 'BarChart3', roles: ['admin', 'manager'] },
  { path: '/settings', label: 'Настройки', icon: 'Settings', roles: ['admin'] },
]
