import {
  ROUTE_V2_HEAD, ROUTE_V2_TAIL, resolveTypeRoute, getStageDef,
  listStageDefs, listActiveStageDefs, getSnapshotRates, isCustomStageKey, isCustomTypeOrder,
} from './lib/route-registry'

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

// R25.1 (ТЗ 17.11 Фаза 1): +5 этапов отдела продаж/ОДП (awaiting_payment,
// design_approval, subcontract, awaiting_pickup, delivery), подписи «Новый
// заказ» и «ТК». `.order` — канонический порядок ТЗ (по нему строятся колонки
// канбана); относительный порядок прежних статусов не изменился, поэтому
// фолбэк getNextStatus для v1 даёт прежний результат. Устаревшие batch_layout
// и selection_pouring остаются на своих местах с меткой «(устар.)».
export const ORDER_STATUSES = {
  new: { label: 'Новый заказ', color: _DEPT.info, order: 0 },
  awaiting_payment: { label: 'Ждёт оплаты', color: _DEPT.info, order: 1 },
  design: { label: 'Дизайн', color: _DEPT.design, order: 2 },
  design_approval: { label: 'Утверждение дизайна', color: _DEPT.design, order: 3 },
  sample_layout: { label: 'Вёрстка образца', color: _DEPT.design, order: 4 },
  sample_print: { label: 'Печать образца', color: _DEPT.print, order: 5 },
  color_approval: { label: 'Утверждение цвета', color: _DEPT.info, order: 6 },
  // R22.4 (ТЗ 20.07 Фаза 4Б): batch_layout упразднён — метка «(устар.)»,
  // ключ оставлен для истории/off-route. В маршрутах/меню/фильтрах отсутствует.
  batch_layout: { label: 'Вёрстка тиража (устар.)', color: _DEPT.design, order: 7 },
  prepress: { label: 'Препресс', color: _DEPT.design, order: 8 },
  subcontract: { label: 'Субподряд', color: _DEPT.info, order: 9 },
  print: { label: 'Печать', color: _DEPT.print, order: 10 },
  lamination: { label: 'Ламинация', color: _DEPT.print, order: 11 },
  cutting: { label: 'Резка', color: _DEPT.print, order: 12 },
  // R22.4 (Фаза 4А): «Выборка» выше «Заливки» — порядок колонок канбана/
  // PipelineSummary и меню. selection → pouring → drying.
  selection: { label: 'Выборка', color: _DEPT.pouring, order: 13 },
  pouring: { label: 'Заливка', color: _DEPT.pouring, order: 14 },
  drying: { label: 'Сушка', color: _DEPT.pouring, order: 15 },
  // R22.4 (Фаза 4Б): selection_pouring упразднён — метка «(устар.)», ключ
  // оставлен для истории старых заказов и рендера логов.
  selection_pouring: { label: 'Выборка / Заливка (устар.)', color: _DEPT.pouring, order: 16 },
  assembly_3d: { label: 'Сборка 3D', color: _DEPT.finish, order: 17 },
  packaging: { label: 'Упаковка', color: _DEPT.finish, order: 18 },
  // R25.1: ключ otk прежний, подпись «ОТК / Выдача» → «ТК» (выдача — отдельный
  // этап awaiting_pickup в маршруте v2).
  otk: { label: 'ТК', color: _DEPT.finish, order: 19 },
  awaiting_pickup: { label: 'Ждёт выдачи', color: _DEPT.info, order: 20 },
  delivery: { label: 'Доставка', color: _DEPT.info, order: 21 },
  done: { label: 'Готово', color: _DEPT.finish, order: 22 },
  cancelled: { label: 'Отменён', color: _DEPT.danger, order: 23 },
}

// Все активные (не завершённые) статусы в каноническом порядке, включая
// устаревшие (batch_layout/selection_pouring) — чтобы заказ на «грязном»
// статусе не терялся в фильтрах/счётчиках. Единый источник для списков
// активных статусов (OrdersPage, Dashboard, планировщик, склад и т.п.).
export const TERMINAL_STATUSES = ['done', 'cancelled']
export const ACTIVE_ORDER_STATUSES = Object.keys(ORDER_STATUSES)
  .filter((s) => !TERMINAL_STATUSES.includes(s))
  .sort((a, b) => ORDER_STATUSES[a].order - ORDER_STATUSES[b].order)

// R25.7A: цвет своего этапа по отделу каталога k24_stage_defs.department.
const _STAGE_DEF_DEPT_COLOR = {
  sales: _DEPT.info,
  prepress: _DEPT.design,
  print: _DEPT.print,
  '3d': _DEPT.pouring,
  osk: _DEPT.finish,
}

/**
 * R25.7A: описание статуса { label, color, order } — встроенный из
 * ORDER_STATUSES, свой этап (custom_<N>) — из каталога реестра (порядок —
 * после встроенных, по sort_order). Неизвестный ключ → null.
 */
export function getStatusMeta(status) {
  if (!status) return null
  if (ORDER_STATUSES[status]) return ORDER_STATUSES[status]
  const def = getStageDef(status)
  if (!def) return null
  return {
    label: def.name || status,
    color: _STAGE_DEF_DEPT_COLOR[def.department] || _DEPT.info,
    order: 100 + (Number(def.sort_order) || 0),
    custom: true,
  }
}

/**
 * R25.7D: активные статусы с учётом своих этапов каталога (включая архивные —
 * заказ может стоять на этапе, отправленном в архив). Для запросов списков
 * заказов (Заказы, планировщик, счётчики меню): статичный ACTIVE_ORDER_STATUSES
 * своих этапов не знает. Вызывать в момент запроса — реестр грузится после логина.
 */
let _activeStatusesCache = { key: '', value: ACTIVE_ORDER_STATUSES }
export function getActiveOrderStatuses() {
  const custom = listStageDefs().map((s) => s.key).filter(isCustomStageKey)
  const key = custom.join(',')
  // Тот же массив, пока каталог не изменился — безопасно для deps хуков.
  if (key !== _activeStatusesCache.key) {
    _activeStatusesCache = { key, value: custom.length ? [...ACTIVE_ORDER_STATUSES, ...custom] : ACTIVE_ORDER_STATUSES }
  }
  return _activeStatusesCache.value
}

// R25.1: этапы отдела продаж (менеджер), раздел «Продажи» (/sales).
export const SALES_STAGES = [
  'new', 'awaiting_payment', 'design_approval', 'color_approval',
  'subcontract', 'awaiting_pickup', 'delivery',
]

// R25.1: этапы маршрута v2 со своей карточкой действий на вкладке «Прогресс»
// (SalesStageCard, ТЗ 1.3–1.5).
export const SALES_CARD_STAGES = ['awaiting_payment', 'design_approval', 'awaiting_pickup', 'delivery']

// R25.1 (ТЗ 1.3): текст подтверждения запуска без оплаты (карточка, канбан, кнопка).
export const NO_PAYMENT_CONFIRM_MESSAGE = 'Оплата не отмечена. Запустить заказ в работу без оплаты?'

// R25.1: этапы без полей ввода (серверная check_stage_completion → «готово»).
export const NO_INPUT_STAGES_V2 = ['awaiting_payment', 'design_approval', 'subcontract', 'awaiting_pickup', 'delivery']

// --- Order routes by type ---
// R11.1 (бриф 31.05): добавлен sample-workflow префикс перед основным циклом
// для всех типов — `sample_layout → sample_print → color_approval → prepress`.
// `design` и `prepress` остаются (по решению пользователя «оставить рядом»);
// `design` скипается при `design_status='provided'` (getOrderRoute).
// 3D-типы получили этап `drying` (sticker3D) и новый `selection` после сушки.
// sticker_kiss/big/rect упаковываются стрейч-пленкой на ОТК — поэтому в их
// маршруте нет `packaging` (R11.1 — раньше использовали общий ROUTE_REGULAR).
// R13.0 (бриф 02.06): `batch_layout` удалён из маршрута — менеджер считает его
// дублирующим `prepress`. Статус остаётся в ORDER_STATUSES для совместимости
// с историей старых заказов; миграция 049 переносит активные на `prepress`.
const HEAD = ['new', 'design', 'sample_layout', 'sample_print', 'color_approval', 'prepress']

const ROUTE_STICKER_CUT  = [...HEAD, 'print', 'lamination', 'cutting', 'packaging', 'otk', 'done']
const ROUTE_STICKER_KISS = [...HEAD, 'print', 'lamination', 'cutting', 'otk', 'done']
const ROUTE_STICKERPACK  = [...HEAD, 'print', 'lamination', 'cutting', 'packaging', 'otk', 'done']
const ROUTE_BIG          = [...HEAD, 'print', 'lamination', 'cutting', 'otk', 'done']
const ROUTE_RECT         = [...HEAD, 'print', 'lamination', 'cutting', 'otk', 'done']
const ROUTE_3D_STICKER   = [...HEAD, 'print', 'cutting', 'pouring', 'drying', 'selection', 'packaging', 'otk', 'done']
// R22.4 (ТЗ 20.07 Фаза 4Б): stickerpack3D переведён с dual-track (подзадачи
// фоны/стикеры + selection_pouring) на линейный маршрут с раздельными
// «Выборка → Заливка → Сушка». selection_pouring упразднён.
const ROUTE_3D_STICKERPACK = [...HEAD, 'print', 'lamination', 'cutting', 'selection', 'pouring', 'drying', 'assembly_3d', 'packaging', 'otk', 'done']

export const ORDER_ROUTES = {
  sticker_cut: ROUTE_STICKER_CUT,
  sticker_kiss: ROUTE_STICKER_KISS,
  stickerpack: ROUTE_STICKERPACK,
  sticker3D: ROUTE_3D_STICKER,
  stickerpack3D: ROUTE_3D_STICKERPACK,
  rect: ROUTE_RECT,
  big: ROUTE_BIG,
  // R25.4: «Прочее» создаётся только в v2 (default route_version=2). Для v1 —
  // универсальный маршрут на случай смены типа у старого заказа (снапшот v1
  // типы 'other' не включает — эталон не меняется).
  other: [...HEAD, 'print', 'lamination', 'cutting', 'selection', 'pouring', 'drying', 'assembly_3d', 'packaging', 'otk', 'done'],
}

// --- R25.1 (ТЗ 17.11 Фаза 1): маршруты версии 2 ---
// Маршрут = голова + производственная часть по типу + хвост. Упаковка
// обязательна для всех типов. Субподряд — отдельная короткая ветка.
// R25.7A: голова и хвост — из route-registry (общий источник со сборкой
// маршрута типа из реестра и SQL k24_build_route_snapshot).
const HEAD_V2 = ROUTE_V2_HEAD
const TAIL_V2 = ROUTE_V2_TAIL
const PROD_FLAT_V2 = ['print', 'lamination', 'cutting', 'packaging']
const PROD_3D_STICKER_V2 = ['print', 'cutting', 'pouring', 'drying', 'selection', 'packaging']
const PROD_UNIVERSAL_V2 = ['print', 'lamination', 'cutting', 'selection', 'pouring', 'drying', 'assembly_3d', 'packaging']
export const ROUTE_SUBCONTRACT_V2 = ['new', 'awaiting_payment', 'design', 'design_approval', 'subcontract', 'packaging', ...TAIL_V2]

export const ORDER_ROUTES_V2 = {
  sticker_cut:   [...HEAD_V2, ...PROD_FLAT_V2, ...TAIL_V2],
  sticker_kiss:  [...HEAD_V2, ...PROD_FLAT_V2, ...TAIL_V2],
  stickerpack:   [...HEAD_V2, ...PROD_FLAT_V2, ...TAIL_V2],
  rect:          [...HEAD_V2, ...PROD_FLAT_V2, ...TAIL_V2],
  big:           [...HEAD_V2, ...PROD_FLAT_V2, ...TAIL_V2],
  sticker3D:     [...HEAD_V2, ...PROD_3D_STICKER_V2, ...TAIL_V2],
  stickerpack3D: [...HEAD_V2, ...PROD_UNIVERSAL_V2, ...TAIL_V2],
  // «Прочее» (тип появится в фазе 4): универсальный маршрут, ненужные этапы
  // менеджер пропускает вручную (StageJumper, kind='manual_skip').
  other:         [...HEAD_V2, ...PROD_UNIVERSAL_V2, ...TAIL_V2],
}

/** Версия маршрута заказа: 2 — только при явном route_version >= 2, иначе 1. */
export function getRouteVersion(order) {
  return Number(order?.route_version) >= 2 ? 2 : 1
}

export function isRouteV2(order) {
  return getRouteVersion(order) === 2
}

/** v2: нужна ли ламинация — ламинация ИЛИ монтажная плёнка (ТЗ 1.2). */
function needsLaminationStageV2(order) {
  return order?.need_lam === true || order?.needs_montage_film === true
}

/**
 * R25.7A: правила конкретного заказа поверх маршрута типа v2 (ТЗ 1.2 / 7.2):
 * макет от клиента, ламинация/монтажная плёнка, способ получения. Одинаковы
 * для снимка заказа, реестра типов и констант.
 */
export function applyV2Rules(stages, order) {
  let route = stages
  if (order?.design_status === 'provided') {
    route = route.filter((s) => s !== 'design' && s !== 'design_approval')
  }
  if (!needsLaminationStageV2(order)) route = route.filter((s) => s !== 'lamination')
  if (order?.delivery_type !== 'delivery') route = route.filter((s) => s !== 'delivery')
  // subcontract в обычном маршруте отсутствует; packaging и awaiting_payment
  // не пропускаются никогда.
  return route
}

/**
 * Маршрут типа v2 ДО правил заказа. Приоритет (R25.7A):
 *   снимок заказа (route_snapshot) → тип из реестра k24_order_types → константы.
 */
function getTypeStagesV2(order) {
  const resolved = resolveTypeRoute(order)
  if (resolved) return resolved.stages
  return ORDER_ROUTES_V2[order?.order_type] || ORDER_ROUTES_V2.sticker_cut
}

function getOrderRouteV2(order) {
  if (order?.is_subcontract === true) {
    let route = ROUTE_SUBCONTRACT_V2
    if (order?.design_status === 'provided') {
      route = route.filter((s) => s !== 'design' && s !== 'design_approval')
    }
    if (order?.delivery_type !== 'delivery') route = route.filter((s) => s !== 'delivery')
    return route
  }
  return applyV2Rules(getTypeStagesV2(order), order)
}

export const IS_3D_TYPE = (orderType) => orderType === 'sticker3D' || orderType === 'stickerpack3D'
export const IS_3D_STICKERPACK = (orderType) => orderType === 'stickerpack3D'

// Stages where stickerpack3D has two parallel FILM tracks (backgrounds + stickers).
// R22.4 (Фаза 4Б): selection_pouring убран — этап упразднён.
// R23.3 (ТЗ 23.07 Фаза 8.1/8.4): печать и резка stickerpack3D переведены на
// ОДНУ плёнку и single-track форму («напечатано изделий» + плёнка / «нарезано»
// + брак, виды убраны). Список пуст → isDualTrack всегда false; двухтрековые
// ПОЛЯ в STAGE_FIELDS.print/cutting остаются как документация исторической
// структуры логов (track='backgrounds'/'stickers'), но формой больше не
// используются. Историю читаем через агрегации без фильтра по треку.
export const DUAL_TRACK_STAGES = []
// Stages where only backgrounds track applies (for stickerpack3D)
export const BACKGROUNDS_ONLY_STAGES = ['lamination']

export function isDualTrack(status, order) {
  return IS_3D_STICKERPACK(order?.order_type) && DUAL_TRACK_STAGES.includes(status)
}

// --- Параллельные подзадачи stickerpack3D (миграция 032) ---
// Каждый stickerpack3D заказ имеет 2 подзадачи (track='backgrounds' + 'stickers')
// с собственными маршрутами. Подзадачи продвигаются независимо через RPC
// advance_subtask. Когда обе в 'ready' — основной заказ переходит на assembly_3d.
export const SUBTASK_ROUTE_BACKGROUNDS = ['pending', 'printing', 'laminating', 'cutting', 'selecting', 'ready']
// R11.2: STICKER trek получил drying после pouring (бриф 31.05). Auto-advance
// через pg_cron (миграция 045) каждые 5 минут переводит drying → ready при
// истечении 36 часов от drying_started_at.
export const SUBTASK_ROUTE_STICKERS = ['pending', 'printing', 'cutting', 'pouring', 'drying', 'ready']
// R11.3: extra_stickers — короткий маршрут для допечатки.
// Для 3D-типов (sticker3D, stickerpack3D) — с заливкой+сушкой.
// Для плоских — с опциональной ламинацией.
export const SUBTASK_ROUTE_EXTRA_3D = ['printing', 'cutting', 'pouring', 'drying', 'ready']
export const SUBTASK_ROUTE_EXTRA_FLAT = ['printing', 'laminating', 'cutting', 'ready']

// Маппинг подзадача-статус → этап производства (для UI очередей)
export const SUBTASK_STATUS_TO_STAGE = {
  pending: null,
  printing: 'print',
  laminating: 'lamination',
  cutting: 'cutting',
  selecting: 'selection_pouring',
  pouring: 'selection_pouring',
  drying: null, // пассивное ожидание, нет queue-страницы
  ready: 'assembly_3d',
  cancelled: 'cancelled',
}

export const SUBTASK_STATUS_LABELS = {
  pending: 'Ожидание',
  printing: 'Печать',
  laminating: 'Ламинация',
  cutting: 'Резка',
  selecting: 'Выборка',
  pouring: 'Заливка',
  drying: 'Сушка',
  ready: 'Готово к сборке',
  cancelled: 'Отменено',
}

export const TRACK_LABELS = {
  backgrounds: 'Фон',
  stickers: 'Стикер',
  extra_stickers: 'Доп. стикеры',
}

// Маршрут трека подзадач с учётом флагов заказа.
// R9.5B (бриф 26.05): если order.need_lam=false — у трека backgrounds стадия
// 'laminating' исключается, т.к. ламинация не нужна. Трек stickers не имеет
// ламинации в принципе.
// R11.3: extra_stickers — короткий маршрут допечатки. Для 3D-типов с заливкой+
// сушкой, для плоских — с опциональной ламинацией (по order.need_lam).
export function getSubtaskRoute(track, order) {
  if (track === 'extra_stickers') {
    const is3D = order && (order.order_type === 'sticker3D' || order.order_type === 'stickerpack3D')
    if (is3D) return SUBTASK_ROUTE_EXTRA_3D
    if (!order?.need_lam) return SUBTASK_ROUTE_EXTRA_FLAT.filter((s) => s !== 'laminating')
    return SUBTASK_ROUTE_EXTRA_FLAT
  }
  const base = track === 'backgrounds' ? SUBTASK_ROUTE_BACKGROUNDS : SUBTASK_ROUTE_STICKERS
  if (track === 'backgrounds' && !order?.need_lam) {
    return base.filter((s) => s !== 'laminating')
  }
  return base
}

// Следующий статус подзадачи (для ConfirmDialog «Отправить фоны на N?»).
// Принимает order чтобы корректно перешагнуть skip-стадии.
export function getNextSubtaskStatus(track, currentStatus, order = null) {
  const route = order ? getSubtaskRoute(track, order)
    : (track === 'backgrounds' ? SUBTASK_ROUTE_BACKGROUNDS : SUBTASK_ROUTE_STICKERS)
  const idx = route.indexOf(currentStatus)
  if (idx < 0 || idx >= route.length - 1) return null
  return route[idx + 1]
}

// Get the route for an order based on its type
// R25.1: route_version >= 2 → маршрут v2 (getOrderRouteV2). Для v1 (1 /
// отсутствует / null) код ниже не менялся — побайтно как до R25.1
// (эталон: routes-v1.snapshot.test.js).
export function getOrderRoute(order) {
  if (isRouteV2(order)) return getOrderRouteV2(order)
  let route = ORDER_ROUTES[order?.order_type] || ROUTE_STICKER_CUT
  // Skip lamination if not needed
  if (!order?.need_lam) {
    route = route.filter(s => s !== 'lamination')
  }
  // Skip design when client provided the mockup (nothing to draw).
  // sample_layout/batch_layout остаются — это уже подготовка к печати, а не
  // первичное рисование макета.
  if (order?.design_status === 'provided') {
    route = route.filter(s => s !== 'design')
  }
  // Skip packaging — sticker_kiss/big/rect не используют packaging (отгрузка в
  // стрейч на OTK). Остальные типы: 3D обязательны, иначе при bopp_bag=true.
  const needsPackaging = order?.bopp_bag === true
    || ['stickerpack3D', 'sticker3D'].includes(order?.order_type)
  if (!needsPackaging) {
    route = route.filter(s => s !== 'packaging')
  }
  return route
}

// --- R22.1 (ТЗ 20.07 Фаза 1): подзадачи-допечатки ---
// Допечатка — ручная доработка части тиража по браку/недостаче. Стартует
// всегда с 'print', проходит производственную часть маршрута заказа до
// упаковки включительно и завершается терминальным 'done'. ОТК в маршрут
// допечатки НЕ входит — это этап заказа целиком (допечатанные изделия
// проверяются вместе с заказом; гейт не даёт закрыть заказ раньше допечаток).
//
// Для stickerpack3D применяем НОВУЮ форму маршрута досрочно (до R22.4):
// выборка/заливка/сушка раздельными этапами — снапшот route делает допечатку
// иммунной к смене констант в R22.4.
const REPRINT_ROUTE_3D_STICKERPACK = ['print', 'lamination', 'cutting', 'selection', 'pouring', 'drying', 'assembly_3d', 'packaging']

export const REPRINT_REASONS = { defect: 'Брак', shortage: 'Недостача' }

// Статусы допечатки = ключи ORDER-этапов (print…packaging) + терминальный done.
export const REPRINT_STATUS_LABELS = {
  print: 'Печать',
  lamination: 'Ламинация',
  cutting: 'Резка',
  selection: 'Выборка',
  pouring: 'Заливка',
  drying: 'Сушка',
  assembly_3d: 'Сборка 3D',
  packaging: 'Упаковка',
  done: 'Завершено',
}

export function getReprintRoute(order) {
  let stages
  if (isRouteV2(order)) {
    // R25.1: v2 — производственная часть маршрута до ТК (не включая).
    // Хвост v2 (ТК / Ждёт выдачи / Доставка) — этапы заказа целиком.
    // R25.7A: старт — первый этап производственной части типа (снимок заказа
    // или реестр; у встроенных — «Печать»), иначе упаковка (тип без этапов
    // цеха). Субподряд и заказ без снимка/реестра — по-прежнему от «Печати».
    const resolved = order?.is_subcontract === true ? null : resolveTypeRoute(order)
    if (!resolved && order?.order_type === 'stickerpack3D') {
      stages = REPRINT_ROUTE_3D_STICKERPACK.slice()
      if (!needsLaminationStageV2(order)) stages = stages.filter((s) => s !== 'lamination')
    } else {
      const full = getOrderRoute(order)
      const prodSet = resolved?.production ? [...resolved.production, 'packaging'] : null
      const start = prodSet ? full.findIndex((s) => prodSet.includes(s)) : full.indexOf('print')
      const end = full.indexOf('otk')
      stages = start >= 0 ? full.slice(start, end > start ? end : undefined).filter((s) => s !== 'done') : []
    }
    return [...stages, 'done']
  }
  if (order?.order_type === 'stickerpack3D') {
    stages = REPRINT_ROUTE_3D_STICKERPACK.slice()
    if (!order?.need_lam) stages = stages.filter((s) => s !== 'lamination')
  } else {
    const full = getOrderRoute(order)
    const start = full.indexOf('print')
    stages = start >= 0
      ? full.slice(start).filter((s) => s !== 'otk' && s !== 'done')
      : []
  }
  return [...stages, 'done']
}

/**
 * Ревью R25: можно ли создать допечатку для заказа. Субподрядный заказ (v2)
 * производится у подрядчика — производственной части маршрута нет, допечатка
 * вырождалась в ['done']. Возвращает { ok, reason }.
 */
export function canCreateReprint(order) {
  if (!order) return { ok: false, reason: 'Заказ не загружен' }
  if (isRouteV2(order) && order.is_subcontract === true) {
    return { ok: false, reason: 'Допечатка недоступна для субподрядного заказа — производство у подрядчика' }
  }
  return { ok: true, reason: null }
}

// Этапы, на которых заказ уже дошёл до ТК или прошёл его (v1: otk → done;
// v2: otk → awaiting_pickup/delivery → done). Отменённый — тоже «закрыт».
const AT_OR_PAST_OTK_STATUSES = ['otk', 'awaiting_pickup', 'delivery', 'done', 'cancelled']

/**
 * Ревью R25: откат допечатки разрешён, только пока родитель не дошёл до ТК
 * (RPC rollback_reprint_subtask запрещает его после ТК).
 */
export function canRollbackReprintForOrder(order) {
  return !!order && !AT_OR_PAST_OTK_STATUSES.includes(order.status)
}

// R23.5: лейбл привязки допечатки к виду. Для stickerpack3D — «Вид #N»
// (design_index из k24_pack_designs), для мульти-вида — «Размер #N» (idx из
// k24_order_items). Возвращает null если вид не задан (заказ с одним видом).
export function reprintViewLabel(orderType, viewRef) {
  if (viewRef == null || viewRef === '') return null
  return orderType === 'stickerpack3D' ? `Вид #${viewRef}` : `Размер #${viewRef}`
}

// --- R25.1 (ТЗ 1.3): «Ждёт оплаты» ---
/** Оплаченным считается любой payment_status, кроме «Не оплачено» (включая бартер). */
export function isOrderPaid(order) {
  return !!order?.payment_status && order.payment_status !== 'not_paid'
}

/**
 * Нужно ли подтверждение «Запустить без оплаты?» для перехода from → to.
 * Только v2: переход ВПЕРЁД за этап awaiting_payment, когда оплата не отмечена.
 * Переход в сам awaiting_payment подтверждения не требует.
 */
export function needsNoPaymentConfirm(order, fromStatus, toStatus) {
  if (!isRouteV2(order) || isOrderPaid(order)) return false
  const route = getOrderRoute(order)
  const gate = route.indexOf('awaiting_payment')
  if (gate < 0) return false
  const from = route.indexOf(fromStatus)
  const to = route.indexOf(toStatus)
  if (from < 0 || to < 0) return false
  return from <= gate && to > gate
}

/**
 * v2: следующий этап после awaiting_payment, если при выходе из «Нового заказа»
 * оплата уже отмечена (этап проходится автоматически). Иначе null.
 */
export function getAutoPassTarget(order, fromStatus, toStatus) {
  if (!isRouteV2(order) || toStatus !== 'awaiting_payment' || fromStatus !== 'new') return null
  if (!isOrderPaid(order)) return null
  const route = getOrderRoute(order)
  const idx = route.indexOf('awaiting_payment')
  return idx >= 0 ? route[idx + 1] || null : null
}

/**
 * Этапы, выход с которых ВПЕРЁД блокируется незавершёнными допечатками.
 * v1 — вход в done; v2 — выход с otk (ТЗ 1.5) и любой вход в done.
 */
export function isReprintGateTransition(order, fromStatus, toStatus) {
  if (toStatus === 'done') return true
  if (!isRouteV2(order)) return false
  // Ревью R25: гейт срабатывает при любом переходе, который ПОКИДАЕТ ТК вперёд
  // или ПЕРЕПРЫГИВАЕТ его (force из StageJumper, канбан). Откат с ТК назад —
  // не гейт.
  const route = getOrderRoute(order)
  const otk = route.indexOf('otk')
  if (otk < 0) return fromStatus === 'otk' && ['awaiting_pickup', 'delivery'].includes(toStatus)
  const to = route.indexOf(toStatus)
  if (to <= otk) {
    // Цель вне маршрута (грязные данные) — консервативно по хвосту v2.
    return to < 0 && ['awaiting_pickup', 'delivery'].includes(toStatus)
  }
  if (fromStatus === 'otk') return true
  // Источник до ТК (или вне маршрута) → переход через ТК вперёд.
  return route.indexOf(fromStatus) < otk
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
    // stage:new — приём заказа в работу (переход из «Новый» на первый этап
    // маршрута). Без него StatusSwitcher/канбан блокировали выход из new
    // для всех ролей, включая admin (QA 04.07, баг №3; сид — миграция 068).
    'stage:new',
    // R25.1: этапы отдела продаж / ОДП (сид — миграция 093).
    'stage:awaiting_payment', 'stage:design_approval', 'stage:subcontract',
    'stage:awaiting_pickup', 'stage:delivery',
    'stage:design', 'stage:sample_layout', 'stage:sample_print',
    'stage:color_approval', 'stage:batch_layout', 'stage:prepress',
    'stage:print', 'stage:lamination', 'stage:cutting', 'stage:pouring',
    'stage:selection_pouring', 'stage:drying', 'stage:selection',
    'stage:assembly_3d', 'stage:packaging', 'stage:otk',
  ],
  views: [
    'view:dashboard', 'view:analytics', 'view:finance',
    'view:warehouse', 'view:reports', 'view:settings',
    'view:planning', 'view:sales',
    // R25.5: раздел «Калькулятор» (сид — миграция 100).
    'view:calculator',
  ],
  actions: [
    'order:create', 'order:edit', 'order:cancel',
    // R25.3: откат допечатки на пройденный этап (сид — миграция 095).
    'subtask:rollback',
    'user:manage',
    // R25.5: вкладка «Калькулятор» в настройках (сид — миграция 100).
    'calc:settings',
    // R25.4: справочник подрядчиков (сид — миграция 099).
    'contractor:manage',
    // R25.7: раздел «Типы заказов» в настройках (сид — миграция 102).
    'order_type:manage',
  ],
  materials: [
    'material:add_transaction', 'material:manage', 'material:edit_name',
    'material:archive', 'material:delete',
    'warehouse:edit_operation',
  ],
  // R28.0: CRM (сид — миграция 112; view:crm по умолчанию только admin).
  crm: [
    'view:crm', 'crm:edit', 'crm:manage', 'crm:see_all', 'crm:import',
  ],
}

export const PERMISSION_LABELS = {
  'stage:new': 'Продвигать «Новый заказ» (приём в работу)',
  'stage:awaiting_payment': 'Продвигать «Ждёт оплаты»',
  'stage:design_approval': 'Продвигать «Утверждение дизайна»',
  'stage:subcontract': 'Продвигать «Субподряд»',
  'stage:awaiting_pickup': 'Продвигать «Ждёт выдачи»',
  'stage:delivery': 'Продвигать «Доставка»',
  'stage:design': 'Продвигать «Дизайн»',
  'stage:sample_layout': 'Продвигать «Вёрстка образца»',
  'stage:sample_print': 'Продвигать «Печать образца»',
  'stage:color_approval': 'Продвигать «Утверждение цвета»',
  'stage:batch_layout': 'Продвигать «Вёрстка тиража»',
  'stage:prepress': 'Продвигать «Препресс»',
  'stage:print': 'Продвигать «Печать»',
  'stage:lamination': 'Продвигать «Ламинация»',
  'stage:cutting': 'Продвигать «Резка»',
  'stage:pouring': 'Продвигать «Заливка»',
  'stage:selection_pouring': 'Продвигать «Выборка/Заливка»',
  'stage:drying': 'Продвигать «Сушка»',
  'stage:selection': 'Продвигать «Выборка»',
  'stage:assembly_3d': 'Продвигать «Сборка 3D»',
  'stage:packaging': 'Продвигать «Упаковка»',
  'stage:otk': 'Продвигать «ТК»',
  'view:dashboard': 'Видеть «Главная»',
  'view:analytics': 'Видеть «Аналитика»',
  'view:finance': 'Видеть финансы (цены, маржа)',
  'view:warehouse': 'Видеть «Склад»',
  'view:reports': 'Видеть «Отчёты»',
  'view:settings': 'Видеть «Настройки»',
  'view:planning': 'Видеть «Планирование» (бета)',
  'view:sales': 'Видеть «Продажи»',
  'view:calculator': 'Видеть «Калькулятор»',
  'calc:settings': 'Менять настройки калькулятора',
  'order:create': 'Создавать заказы',
  'order:edit': 'Редактировать заказы',
  'order:cancel': 'Отменять заказы',
  'subtask:rollback': 'Откатывать подзадачи (допечатки)',
  'material:add_transaction': 'Вносить приход/расход на складе',
  'material:manage': 'Создавать/удалять позиции склада',
  'material:edit_name': 'Редактировать названия материалов',
  'material:archive': 'Архивировать/редактировать позиции склада',
  'material:delete': 'Полное удаление позиций склада',
  'warehouse:edit_operation': 'Уточнять операции склада (дата, поставщик, вид)',
  'view:crm': 'Видеть раздел «Клиенты» (CRM)',
  'crm:edit': 'Создавать и редактировать клиентов и контакты',
  'crm:manage': 'Удалять и объединять записи CRM',
  'crm:see_all': 'Видеть клиентов всех ответственных',
  'crm:import': 'Импорт и экспорт базы клиентов',
  'user:manage': 'Управлять пользователями',
  'contractor:manage': 'Управлять подрядчиками',
  'order_type:manage': 'Настраивать типы заказов и этапы',
}

/**
 * R25.7D: список прав секции с учётом своих этапов каталога — секция
 * «stages» дополняется stage:custom_<N> (право заводит create_stage_def,
 * миграция 104). Статичный PERMISSIONS не мутируется.
 */
export function getPermissionList(section) {
  const base = PERMISSIONS[section] || []
  if (section !== 'stages') return base
  const custom = listActiveStageDefs().map((s) => `stage:${s.key}`)
  return custom.length ? [...base, ...custom] : base
}

/** R25.7D: подпись права (своему этапу — «Продвигать «<название>»»). */
export function getPermissionLabel(perm) {
  if (PERMISSION_LABELS[perm]) return PERMISSION_LABELS[perm]
  const m = /^stage:(custom_[0-9]+)$/.exec(perm || '')
  const def = m ? getStageDef(m[1]) : null
  return def ? `Продвигать «${def.name}»` : perm
}

// Legacy: hard-coded fallback. Используется до загрузки динамических прав
// и в местах где невозможен async-вызов (например, server-side seed).
// Role permissions: which roles can advance FROM a given status
// R11.1: добавлены sample_layout/batch_layout (designer), sample_print (printer),
// drying/selection (post_printer). color_approval только manager/admin —
// согласование с заказчиком, в legacy для designer/printer/post_printer не даём.
export const ROLE_STAGE_PERMISSIONS = {
  admin: true, // admin can advance any stage
  manager: true, // manager can advance any stage
  designer: ['design', 'sample_layout', 'batch_layout', 'prepress'],
  printer: [
    'sample_layout', 'sample_print', 'prepress', 'print', 'lamination', 'cutting',
    'selection_pouring', 'pouring', 'assembly_3d', 'packaging',
  ],
  post_printer: [
    'selection_pouring', 'pouring', 'drying', 'selection',
    'assembly_3d', 'packaging', 'cutting', 'lamination', 'print',
  ],
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

// R9.3C (бриф 26.05): запись лога открыта всем production-ролям. Роль определяет
// только право продвинуть заказ на следующий этап (canWorkOnStage), но НЕ право
// зафиксировать факт работы. Возвращает true для любого пользователя — селект
// stage в ProductionLogForm/OrderStageInput строится из getOrderRoute(order),
// а advance-кнопка скрывается через canWorkOnStage.
export function canWriteLogForStage(role) {
  return !!role
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
  // R25.4 (ТЗ 4.1): «Прочее» — магниты и т.п. Название продукции хранится в
  // order.product_name и показывается вместо «Прочее» (formatOrderType).
  other: { label: 'Прочее' },
}

/** R25.4: «Прочее» — тип с обязательным названием продукции. */
export const ORDER_TYPE_OTHER = 'other'
export const PRODUCT_NAME_MAX = 100

/**
 * R25.4 (ТЗ 4.5): «Поштучная резка» связана с типом у винилового стикера:
 * включена — «Стикер вырубной», выключена — «Стикер на подложке».
 * У стикерпаков галочка скрыта; у 3D-стикера и прочих — независимая.
 */
export const INDIVIDUAL_CUT_LINKED_TYPES = { on: 'sticker_cut', off: 'sticker_kiss' }

export function isIndividualCutHidden(orderType) {
  return orderType === 'stickerpack' || orderType === 'stickerpack3D'
}

/** Тип при переключении галочки «Поштучная резка» (только виниловый стикер). */
export function orderTypeForIndividualCut(orderType, checked) {
  if (orderType !== 'sticker_cut' && orderType !== 'sticker_kiss') return orderType
  return checked ? INDIVIDUAL_CUT_LINKED_TYPES.on : INDIVIDUAL_CUT_LINKED_TYPES.off
}

/** Значение галочки при выборе типа: null — не трогать (независимая/скрытая). */
export function individualCutForOrderType(orderType) {
  if (orderType === 'sticker_cut') return true
  if (orderType === 'sticker_kiss') return false
  if (isIndividualCutHidden(orderType)) return false
  return null
}

/**
 * R25.4 (ТЗ 4.2): субподряд можно включить/выключить, пока заказ не дошёл до
 * цеха — этапы от «Новый заказ» до «Препресс» или «Субподряд». Только v2
 * (маршрут v1 субподряд не учитывает).
 */
export const SUBCONTRACT_TOGGLE_STATUSES = [
  'new', 'awaiting_payment', 'design', 'design_approval',
  'sample_layout', 'sample_print', 'color_approval', 'prepress', 'subcontract',
]

export function canToggleSubcontract(order) {
  // Ревью R25: Number(undefined) < 2 → false (NaN), заказ без route_version
  // ошибочно считался v2. isRouteV2 — единый критерий версии маршрута.
  if (!isRouteV2(order)) return false
  return SUBCONTRACT_TOGGLE_STATUSES.includes(order?.status || 'new')
}

/** R25.4 (ТЗ 4.6): максимум видов изделий в заказе (как в калькуляторе). */
export const MAX_ORDER_ITEMS = 9

// --- Lamination types (включая перенос на монтажную плёнку — R8.2 серии 25.05) ---
// Все три варианта проходят через стадию `lamination` производственного маршрута;
// для `transfer` материал — «Монтажная плёнка 1.26 м» (material_code='transfer').
export const LAMINATION_TYPES = {
  matte: { label: 'Матовая' },
  glossy: { label: 'Глянцевая' },
  transfer: { label: 'Монтажная плёнка 1.26 м' },
}

/**
 * Нужна ли стадия `lamination` в маршруте.
 * Принимает значение поля order.lam_type (matte/glossy/transfer/null).
 */
// R25.4 (ТЗ 4.3): в форме заказа ламинация — только матовая/глянцевая.
// Монтажная плёнка — отдельная галочка (needs_montage_film + montage_material_id).
// 'transfer' остаётся в LAMINATION_TYPES для старых заказов (читаются и
// списываются как раньше).
export const LAMINATION_FORM_TYPES = ['matte', 'glossy']
export const MONTAGE_MATERIAL_CODE = 'transfer'
/** Коды, исключённые из выбора ламинации в форме заказа (стабильная ссылка). */
export const LAMINATION_FORM_EXCLUDE_CODES = [MONTAGE_MATERIAL_CODE]

export function needsLamination(lamType) {
  return lamType != null && lamType !== '' && Object.prototype.hasOwnProperty.call(LAMINATION_TYPES, lamType)
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
  // R25.4 (ТЗ 4.4): правка макета — «Дизайн» и «Утверждение дизайна»
  // остаются в маршруте, как при разработке.
  needs_edit: { label: 'Требуется правка макета' },
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
  blade: { label: 'Нож для плоттера', unit: 'шт' },
}

// --- Material categories (UI группировка по аудиту 8.05) ---
// Старое поле `type` в БД остаётся как есть; категория — это UI-группа,
// определяемая по type или по имени материала (для пакетов БОПП — по ширине).
export const MATERIAL_CATEGORIES = {
  film_print: { label: 'Плёнка для печати' },
  film_lam: { label: 'Плёнка для ламинации' },
  chemicals: { label: 'Химические вещества' },
  utensils: { label: 'Утварь' },
  blades: { label: 'Ножи для плоттера' },
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
  if (type === 'blade' || /нож\s*(для\s*)?(summa|плоттер)/i.test(name)) return 'blades'
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
  pouring_per_sticker:  1.0,  // заливка одного стикера (хорошего) — стандартная форма
  selection_per_sticker: 0.5, // выборка фона, оплачивается как qty_selected × stickers_per_pack × 0.5 (фидбэк 17.05)
  assembly_per_pack:    0.5,  // сборка одного пака, считаем по стикерам в паке
  packaging_per_pack:   1.5,  // упаковка одного пака
  // R19: заливка по форме стикера (бриф 30.06). standard = pouring_per_sticker.
  pouring_by_shape: {
    standard:    1.0,
    complex:     1.5, // сложная форма
    big:         1.5, // большая форма
    complex_big: 2.0, // сложная и большая форма
  },
}

// R19: формы (типы) стикеров — влияют на ставку заливки. Хранятся в
// k24_pack_designs.shape_type (по design_index) и k24_orders.sticker_shape.
export const STICKER_SHAPES = {
  standard:    { label: 'Стандартная' },
  complex:     { label: 'Сложная форма' },
  big:         { label: 'Большая форма' },
  complex_big: { label: 'Сложная и большая' },
}

// Структурные поля плёнки/ламинации (запрос менеджера 05.07). Название позиции
// собирается из них через composeMaterialName. finish — мат/глянец.
export const FILM_FINISHES = { M: 'Матовая', G: 'Глянцевая' }
// Подсказки для datalist (не ограничивают ввод — менеджер может вписать своё).
export const FILM_MANUFACTURERS = ['Orajet', 'Oracal', 'Duckson', 'Dickson', 'Oraguard']
export const FILM_COLORS = ['Белая', 'Прозрачная', 'Чёрная', 'Золото', 'Серебро', 'Голографическая']

// R19: перевод настроек bonus_rates ({pouring, selection, assembly_3d, packaging,
// pouring_shapes}) в форму WORKER_RATES для calculateWorkerPayout.opts.rates.
export function settingsToRates(bonusRates) {
  if (!bonusRates || typeof bonusRates !== 'object') return undefined
  const r = {}
  if (bonusRates.pouring != null) r.pouring_per_sticker = Number(bonusRates.pouring)
  if (bonusRates.selection != null) r.selection_per_sticker = Number(bonusRates.selection)
  if (bonusRates.assembly_3d != null) r.assembly_per_pack = Number(bonusRates.assembly_3d)
  if (bonusRates.packaging != null) r.packaging_per_pack = Number(bonusRates.packaging)
  if (bonusRates.pouring_shapes && typeof bonusRates.pouring_shapes === 'object') {
    r.pouring_by_shape = bonusRates.pouring_shapes
  }
  return r
}

const POURING_SHAPE_LABEL = {
  standard: 'Заливка (стандартная)',
  complex: 'Заливка (сложная форма)',
  big: 'Заливка (большая форма)',
  complex_big: 'Заливка (сложная и большая)',
}

const POURING_SHAPES = ['standard', 'complex', 'big', 'complex_big']

/**
 * R25.0: полные ставки в форме WORKER_RATES (дефолты + переопределение).
 * pouring_by_shape мёржится поштучно, чтобы частичная карта форм не теряла
 * дефолтные ставки остальных форм.
 * @param {object} [override] — результат settingsToRates() или undefined
 */
export function resolvePayoutRates(override) {
  return {
    ...WORKER_RATES,
    ...(override || {}),
    pouring_by_shape: { ...WORKER_RATES.pouring_by_shape, ...(override?.pouring_by_shape || {}) },
  }
}

/**
 * R25.1 (ТЗ 1.6): сдельная оплата упаковки — только для заказа версии 1
 * (или без известной версии — исторические логи / embed без route_version),
 * 3D-типа или с БОПП-пакетом. Остальная упаковка v2 (обязательная для всех
 * типов) учитывается с оплатой 0 ₽.
 */
export function isPackagingPaid(order) {
  if (!order || order.route_version == null) return true
  if (!isRouteV2(order)) return true
  if (IS_3D_TYPE(order.order_type)) return true
  return order.bopp_bag === true
}

/**
 * R25.0: единая сдельная оплата ОДНОГО лога — источник истины для
 * calculateWorkerPayout (кабинет / FinanceTab / аналитика / Unit Economics)
 * и отчётов «Сдельная оплата» / «Сотрудники» (useBonusReport / useEmployeeReport).
 *
 * Правила (поле оплачивается только на «своём» этапе):
 *   • pouring | selection_pouring: stickers_good (>0) × ставка формы → 'pouring_<shape>'
 *   • selection_pouring: qty_selected × stickers_per_pack → 'selection'
 *   • selection: qty_selected × (stickers_per_pack для stickerpack3D, иначе 1) → 'selection'
 *   • assembly_3d: packs_assembled × stickers_per_pack → 'assembly'
 *   • packaging: packs_packaged → 'packaging'
 * stickers_per_pack = order.stickers_per_pack (NULL/0 → 1).
 *
 * До R25.0 отчёты платили по полю без проверки этапа (напр. упаковка — по любому
 * логу с packs_packaged). В проде таких логов нет (эталон r25-baseline.json,
 * quirk_fields_off_stage = 0), поэтому цифры мая–ноября не меняются.
 *
 * @param {object} log — запись k24_production_logs
 * @param {object|null} order — заказ лога (нужны order_type, stickers_per_pack)
 * @param {object} rates — полные ставки (resolvePayoutRates())
 * @param {object} [ctx]
 * @param {string} [ctx.shape] — форма стикера для заливки (дефолт 'standard')
 * @returns {Array<{category: string, qty: number, units: number, rate: number, amount: number, shape?: string}>}
 *   qty — исходное количество из лога (стикеры / фоны / паки), units — оплачиваемые
 *   единицы (qty × множитель), amount = units × rate. Пустой массив — лог не оплачивается.
 */
// R25.7D (ТЗ 7.6): основное поле количества этапа для ставки своего типа.
// Заливка — stickers_good (= залито − брак), свой этап — выполнено − брак.
const TYPE_RATE_QTY_FIELD = {
  print: 'stickers_printed',
  lamination: 'lamination_qty',
  cutting: 'qty_cut',
  pouring: 'stickers_good',
  selection: 'qty_selected',
  assembly_3d: 'packs_assembled',
  packaging: 'packs_packaged',
}

/** Количество лога для ставки своего типа (0 — этап без количества). */
export function typeRateQty(log) {
  const stage = log?.stage
  if (isCustomStageKey(stage)) {
    return Math.max(0, (Number(log.qty_done) || 0) - (Number(log.defects) || 0))
  }
  const field = TYPE_RATE_QTY_FIELD[stage]
  return field ? Number(log[field]) || 0 : 0
}

/**
 * R25.7D: оплата лога заказа своего типа по ставкам из снимка маршрута.
 * units = qty × (stickers_per_pack, если база «за стикер» и тип — набор).
 * Этап без ставки — без сдельной оплаты.
 */
export function computeTypeRatePayout(log, order, typeRates) {
  const stage = log?.stage
  const r = typeRates?.[stage]
  const rate = Number(r?.rate)
  if (!r || !Number.isFinite(rate) || rate <= 0) return []
  const qty = typeRateQty(log)
  if (!qty) return []
  const perSticker = r.base === 'sticker' && order?.route_snapshot?.is_set === true
  const mult = perSticker ? (Number(order?.stickers_per_pack) || 1) : 1
  const units = qty * mult
  return [{ category: 'type_rate', stage, base: perSticker ? 'sticker' : 'item', qty, units, rate, amount: units * rate }]
}

export function computeLogPayout(log, order, rates, ctx = {}) {
  const out = []
  if (!log) return out
  const stage = log.stage
  // R25.2 (ТЗ 2.5): записи брака ТК — контроль, не работа; сдельно не платятся.
  // Явное исключение: на них не должна сработать ни одна ветка ниже.
  if (stage === 'otk') return out
  // R25.7D (ТЗ 7.6): свой тип — только ставки из снимка маршрута заказа
  // (смена ставки в типе прошлую оплату не меняет). Правила встроенных типов
  // (форма заливки, упаковка только у 3D/БОПП) к своим типам не применяются.
  // Встроенные типы (snapshot.builtin / нет снимка) — ветки ниже без изменений.
  if (isCustomTypeOrder(order)) {
    return computeTypeRatePayout(log, order, getSnapshotRates(order))
  }
  const perPack = Number(order?.stickers_per_pack) || 1

  if (stage === 'pouring' || stage === 'selection_pouring') {
    const good = Number(log.stickers_good) || 0
    if (good > 0) {
      const shape = POURING_SHAPES.includes(ctx.shape) ? ctx.shape : 'standard'
      const rate = rates.pouring_by_shape?.[shape] ?? rates.pouring_per_sticker
      out.push({ category: `pouring_${shape}`, shape, qty: good, units: good, rate, amount: good * rate })
    }
  }
  if (stage === 'selection_pouring' || stage === 'selection') {
    const qty = Number(log.qty_selected) || 0
    if (qty !== 0) {
      // selection_pouring — выборка фонов (×spp). selection: R11 штучные стикеры
      // sticker3D (×1); R22.7 — у stickerpack3D это выборка фонов (×spp).
      const mult = stage === 'selection_pouring' || order?.order_type === 'stickerpack3D' ? perPack : 1
      const units = qty * mult
      const rate = rates.selection_per_sticker
      out.push({ category: 'selection', qty, units, rate, amount: units * rate })
    }
  }
  if (stage === 'assembly_3d') {
    const packs = Number(log.packs_assembled) || 0
    if (packs !== 0) {
      const units = packs * perPack
      const rate = rates.assembly_per_pack
      out.push({ category: 'assembly', qty: packs, units, rate, amount: units * rate })
    }
  }
  if (stage === 'packaging' && isPackagingPaid(order)) {
    const packs = Number(log.packs_packaged) || 0
    if (packs !== 0) {
      const rate = rates.packaging_per_pack
      out.push({ category: 'packaging', qty: packs, units: packs, rate, amount: packs * rate })
    }
  }
  return out
}

/**
 * Подсчитать заработок работника из массива production logs.
 *
 * @param {Array} logs — записи k24_production_logs (могут содержать связанный order через order_id/order)
 * @param {object} [opts]
 * @param {object} [opts.ordersById] — карта { [order_id]: order } чтобы достать stickers_per_pack
 * @param {object} [opts.rates] — переопределение ставок (форма WORKER_RATES). Дефолт — WORKER_RATES.
 * @param {object} [opts.shapeByDesign] — { `${order_id}:${design_index}`: shape } из k24_pack_designs
 * @param {object} [opts.orderShape] — { [order_id]: shape } из k24_orders.sticker_shape
 * @returns {{ breakdown: object, total: number }}
 *
 * Пологовая оплата — computeLogPayout (R25.0). R19: заливка по форме стикера
 * (standard 1.0 / complex 1.5 / big 1.5 / complex_big 2.0); форма ищется по
 * design_index в shapeByDesign, затем order-level orderShape, иначе 'standard'.
 * breakdown заливки разбит на pouring_<shape>.
 */
export function calculateWorkerPayout(logs, opts = {}) {
  const rates = resolvePayoutRates(opts.rates)
  const resolveShape = (l) =>
    opts.shapeByDesign?.[`${l.order_id}:${l.design_index}`]
    || opts.orderShape?.[l.order_id]
    || 'standard'

  const pouringByShape = { standard: 0, complex: 0, big: 0, complex_big: 0 }
  let packaging = 0
  // Выборку и сборку считаем в «стикерах», чтобы умножить на ставку 0.5 ₽/стикер.
  let selectionStickers = 0
  let assemblyStickers = 0
  // Для отчётности храним сырые counts тоже
  let selectionBgs = 0
  let assemblyPacks = 0
  // R25.7D: оплата по ставкам своих типов (разные ставки — суммой).
  let typeRateUnits = 0
  let typeRateAmount = 0

  for (const l of logs || []) {
    const order = opts.ordersById?.[l.order_id] || l.order || null
    for (const e of computeLogPayout(l, order, rates, { shape: resolveShape(l) })) {
      if (e.shape) pouringByShape[e.shape] += e.units
      else if (e.category === 'selection') { selectionBgs += e.qty; selectionStickers += e.units }
      else if (e.category === 'assembly') { assemblyPacks += e.qty; assemblyStickers += e.units }
      else if (e.category === 'packaging') packaging += e.units
      else if (e.category === 'type_rate') { typeRateUnits += e.units; typeRateAmount += e.amount }
    }
  }

  const breakdown = {}
  for (const shape of POURING_SHAPES) {
    const count = pouringByShape[shape] || 0
    const rate = rates.pouring_by_shape[shape] ?? rates.pouring_per_sticker
    breakdown[`pouring_${shape}`] = { count, rate, amount: count * rate, label: POURING_SHAPE_LABEL[shape], shape }
  }
  breakdown.selection = { count: selectionStickers, rate: rates.selection_per_sticker, amount: selectionStickers * rates.selection_per_sticker, label: 'Выборка фонов', bgs: selectionBgs }
  breakdown.assembly  = { count: assemblyStickers,  rate: rates.assembly_per_pack,     amount: assemblyStickers  * rates.assembly_per_pack,     label: 'Сборка 3D-паков', packs: assemblyPacks }
  breakdown.packaging = { count: packaging,         rate: rates.packaging_per_pack,    amount: packaging         * rates.packaging_per_pack,    label: 'Упаковка паков' }
  // Ключ добавляется только при наличии оплаты по своим типам — у встроенных
  // типов breakdown прежний (эталонные тесты оплаты не меняются).
  if (typeRateUnits > 0) {
    // rate — средняя ставка (подпись «N шт × R ₽»); сумма — точная.
    const avgRate = Math.round((typeRateAmount / typeRateUnits) * 100) / 100
    breakdown.type_rates = { count: typeRateUnits, rate: avgRate, amount: typeRateAmount, label: 'Ставки своих типов' }
  }

  const total = Object.values(breakdown).reduce((sum, b) => sum + b.amount, 0)
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
  other: ['Препресс', 'Производство', 'Проверка качества'],
}

// --- Stage notification roles: when order enters status, notify these roles ---
export const NOTIFY_ROLES = {
  design: ['designer'],
  sample_layout: ['designer'],
  sample_print: ['printer'],
  color_approval: ['manager'],
  batch_layout: ['designer'],
  prepress: ['designer', 'printer'],
  print: ['printer'],
  lamination: ['printer'],
  cutting: ['printer'],
  selection_pouring: ['post_printer'],
  pouring: ['post_printer'],
  drying: ['post_printer'],
  selection: ['post_printer'],
  assembly_3d: ['post_printer'],
  packaging: ['post_printer'],
  otk: ['manager'],
  // R25.1: этапы отдела продаж сигналят менеджеру.
  awaiting_payment: ['manager'],
  design_approval: ['manager'],
  subcontract: ['manager'],
  awaiting_pickup: ['manager'],
  delivery: ['manager'],
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
  // R25.1 (ТЗ 1.7): раздел менеджера — заказы, ждущие действий отдела продаж.
  { path: '/sales', label: 'Продажи', icon: 'Handshake', roles: MANAGER_ROLES, permission: 'view:sales' },
  // R25.5 (ТЗ 5.1): калькулятор стоимости — после «Продаж».
  { path: '/calculator', label: 'Калькулятор', icon: 'Calculator', roles: MANAGER_ROLES, permission: 'view:calculator' },
  // R28.0: CRM. До загрузки прав (legacy roles) виден только admin — скрытый запуск.
  { path: '/crm/clients', label: 'Клиенты', icon: 'Users', roles: ['admin'], permission: 'view:crm' },
  { path: '/production/design', label: 'Дизайн', icon: 'Palette', roles: ['admin', 'manager', 'designer'], permission: 'stage:design' },
  { path: '/production/prepress', label: 'Препресс', icon: 'FileCheck', roles: ['admin', 'manager', 'designer', 'printer'], permission: 'stage:prepress' },
  { path: '/production/print', label: 'Печать', icon: 'Printer', roles: ['admin', 'manager', 'printer'], permission: 'stage:print' },
  { path: '/production/lamination', label: 'Ламинация', icon: 'Layers', roles: ['admin', 'manager', 'printer'], permission: 'stage:lamination' },
  { path: '/production/cutting', label: 'Резка', icon: 'Scissors', roles: ['admin', 'manager', 'printer'], permission: 'stage:cutting' },
  // R22.4 (ТЗ 20.07 Фаза 4А): «Выборка» выше «Заливки», + новый этап «Сушка».
  // permission Выборки исправлен на stage:selection (был устаревший selection_pouring).
  { path: '/production/selection', label: 'Выборка', icon: 'Combine', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'], permission: 'stage:selection' },
  { path: '/production/pouring', label: 'Заливка', icon: 'Droplets', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'], permission: 'stage:pouring' },
  { path: '/production/drying', label: 'Сушка', icon: 'Wind', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'], permission: 'stage:drying' },
  { path: '/production/assembly3d', label: 'Сборка 3D', icon: 'Hammer', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'], permission: 'stage:assembly_3d' },
  { path: '/production/packaging', label: 'Упаковка', icon: 'Package', roles: ['admin', 'manager', 'post_printer', 'printer'], helperRoles: ['printer'], permission: 'stage:packaging' },
  { path: '/production/otk', label: 'ТК', icon: 'Crosshair', roles: ['admin', 'manager'], permission: 'stage:otk' },
  { path: '/production/plan', label: 'Планирование (бета)', icon: 'CalendarRange', roles: MANAGER_ROLES, permission: 'view:planning' },
  { path: '/cabinet', label: 'Кабинет', icon: 'User', roles: ALL_ROLES }, // личный кабинет — всем
  { path: '/warehouse', label: 'Склад', icon: 'Warehouse', roles: MANAGER_ROLES, permission: 'view:warehouse' },
  { path: '/analytics', label: 'Аналитика', icon: 'BarChart3', roles: MANAGER_ROLES, permission: 'view:analytics' },
  { path: '/reports', label: 'Отчёты', icon: 'FileText', roles: ['admin'], permission: 'view:reports' },
  { path: '/settings', label: 'Настройки', icon: 'Settings', roles: ['admin'], permission: 'view:settings' },
  { path: '/help', label: 'Справка', icon: 'HelpCircle', roles: ALL_ROLES },
]
