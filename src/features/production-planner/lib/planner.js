// R12.1 — основной планировщик. Чистая функция без React/Supabase.
// Все имена/маршруты/поля адаптированы из ТЗ под реальную схему Kontora24
// (см. lib/README.md — карта переменных).
//
// Алгоритм §7 ТЗ:
//   1. Сортировка заказов: rush (urgent) → deadline по возрастанию.
//   2. Для каждого заказа берём активные этапы из getOrderRoute() —
//      отбрасываем всё, что ДО текущего order.status (уже пройдено).
//   3. Для каждого этапа:
//      - milestone (new/color_approval/done/cancelled) — пропускаем,
//        ёмкость не занимаем, доступность не двигаем
//      - passive (drying) — двигаем «доступно с» на ceil(36ч / 8ч)
//        рабочих дней; пассив рисуется отдельно, ёмкость не занимает
//      - есть override → кладём весь блок в pinned_date одним куском,
//        допускается перегруз (намеренно — см. §12 ТЗ)
//      - иначе жадно заполняем дни начиная с «доступно с»:
//        min(остаток_ёмкости_дня, остаток_часов_этапа), переносим хвост
//        на следующий рабочий день
//   4. finishDay = последний день последнего непустого этапа.
//      late = finishDay > deadlineDisplay; risk = finishDay == deadlineDisplay.
//
// dual-track stickerpack3D и multi-variant обрабатываются упрощённо
// в MVP: считаем один общий объём, не разделяем на параллельные чипы.

import { getOrderRoute, ORDER_STATUSES } from '@/shared/constants'
import {
  computeFilmMeters, computeLamMeters, getPrintBlockWidth,
} from '@/features/orders/lib/material-forecast'
import {
  STAGE_TO_BUCKET, BUCKETS, VISIBLE_BUCKETS,
} from './buckets'
import {
  resolveNorms, resolveCapacity, bucketHoursPerDay, DEFAULT_NORMS,
} from './norms'
import {
  addWorkingDays, getWorkingDays, previousWorkingDay,
  toISODate, fromISODate, startOfUTCDay,
} from './working-days'

// ============================================================
// Производные объёмы заказа (§6.1 ТЗ, адаптация под multi-variant)
// ============================================================
// items: массив { width_mm, height_mm, qty } — по строкам k24_order_items.
// Если items пуст — fallback на основные поля заказа.

function normalizeItems(order, items) {
  if (Array.isArray(items) && items.length > 0) {
    return items
      .filter((it) => Number(it.width_mm) > 0 && Number(it.height_mm) > 0 && Math.floor(Number(it.qty) || 0) > 0)
      .map((it) => ({
        width_mm: Number(it.width_mm),
        height_mm: Number(it.height_mm),
        qty: Math.floor(Number(it.qty)),
      }))
  }
  const w = Number(order?.width_mm) || 0
  const h = Number(order?.height_mm) || 0
  const q = Math.floor(Number(order?.qty) || 0)
  if (!w || !h || !q) return []
  return [{ width_mm: w, height_mm: h, qty: q }]
}

/**
 * Производные величины §6.1 ТЗ, агрегированные по multi-variant items.
 *   - pieces       — общее количество одиночных изделий (с учётом per_pack)
 *   - fony         — количество фонов (1 на пак для stickerpack3D)
 *   - printMeters  — суммарный пог.м печати (с учётом film_type)
 *   - lamMeters    — суммарный пог.м ламинации (block_width=1230)
 *   - packs        — суммарный тираж паков (для assembly/packaging)
 */
export function computeOrderVolumes(order, items) {
  const list = normalizeItems(order, items)
  const isPack = order?.order_type === 'stickerpack' || order?.order_type === 'stickerpack3D'
  const perPack = isPack ? Math.max(1, Number(order?.stickers_per_pack) || 1) : 1
  const designVariants = Math.max(1, Number(order?.design_variants) || 1)
  const blockW = getPrintBlockWidth(order?.film_type)

  // R14.7: design_variants — это число УНИКАЛЬНЫХ ДИЗАЙНОВ, распределённых
  // внутри qty/пака, а не множитель физического тиража. Пример: stickerpack3D
  // qty=100 паков × stickers_per_pack=10 × design_variants=10 → надо напечатать
  // 1000 стикеров (10 дизайнов используются в 10-стикерном паке), НЕ 10 000.
  // designVariants остаётся в результате чтобы design-стадия могла масштабировать
  // часы дизайнера через norms.design_multiply_kinds.
  let pieces = 0
  let printMeters = 0
  let lamMeters = 0
  let totalQty = 0
  for (const it of list) {
    const piecesThis = isPack ? it.qty * perPack : it.qty
    pieces += piecesThis
    totalQty += it.qty
    printMeters += computeFilmMeters({
      widthMm: it.width_mm, heightMm: it.height_mm,
      qty: piecesThis, blockWidthMm: blockW,
    })
    lamMeters += computeLamMeters({
      widthMm: it.width_mm, heightMm: it.height_mm, qty: piecesThis,
    })
  }
  const fony = order?.order_type === 'stickerpack3D' ? totalQty : 0
  const packs = isPack ? totalQty : 0
  const kinds = list.length // multi-variant items count
  return { pieces, fony, printMeters, lamMeters, packs, kinds, designVariants }
}

// ============================================================
// Длительность этапа в часах (§6.2 ТЗ + R11 этапы)
// ============================================================

const HOURS_PER_DAY = 8

export function getStageDurationHours(stage, order, items, normsValue) {
  const norms = resolveNorms(normsValue)
  const vol = computeOrderVolumes(order, items)

  switch (stage) {
    case 'design': {
      const days = Math.max(0, Number(norms.design_days) || 0)
      const multi = norms.design_multiply_kinds ? vol.designVariants : 1
      return days * HOURS_PER_DAY * multi
    }
    case 'sample_layout':
      return (Number(norms.verstka_minutes) || 0) / 60
    case 'sample_print':
      return (Number(norms.sample_print_minutes) || 0) / 60
    case 'batch_layout':
      return ((Number(norms.batch_layout_minutes_per_kind) || 0) * vol.kinds) / 60
    case 'prepress':
      return ((Number(norms.prepress_minutes_per_kind) || 0) * vol.kinds) / 60
    case 'print': {
      const perBlock = Number(norms.print_meters_per_30min) || 1.5
      const minutesPerBlock = 30
      return (vol.printMeters / perBlock) * minutesPerBlock / 60
    }
    case 'lamination': {
      const perBlock = Number(norms.lamination_meters_per_20min) || 1.5
      // Для stickerpack3D ламинация только на фонах — печать фонов уходит
      // в lamination. В MVP используем общий printMeters, но с коэффициентом
      // если stickerpack3D (фоны = 1 на пак, остальное стикеры). Для
      // простоты в R12.1: lamMeters считается как полная плёнка — менеджер
      // потом увидит загрузку и при необходимости подкрутит норматив.
      return (vol.lamMeters / perBlock) * 20 / 60
    }
    case 'cutting': {
      const perBlock = Number(norms.cutting_meters_per_15min) || 1.5
      return (vol.printMeters / perBlock) * 15 / 60
    }
    case 'pouring': {
      // sticker3D: pieces / 2184 × 8ч
      const per8h = Math.max(1, Number(norms.resin_stickers_per_8h) || 2184)
      return (vol.pieces / per8h) * HOURS_PER_DAY
    }
    case 'selection_pouring': {
      // Параллельная заливка стикеров + выборка фонов в одном бакете
      // post_print. Берём max(заливка, выборка) — это часы одного потока
      // если бригада делит ресурсы (как у пользователя).
      const resinPer = Math.max(1, Number(norms.resin_stickers_per_8h) || 2184)
      const weedPer  = Math.max(1, Number(norms.weeding_backgrounds_per_8h) || 600)
      const resinH = (vol.pieces / resinPer) * HOURS_PER_DAY
      const weedH  = (vol.fony / weedPer) * HOURS_PER_DAY
      return Math.max(resinH, weedH)
    }
    case 'selection': {
      const per8h = Math.max(1, Number(norms.selection_stickers_per_8h) || 2184)
      return (vol.pieces / per8h) * HOURS_PER_DAY
    }
    case 'assembly_3d': {
      const per8h = Math.max(1, Number(norms.assembly_packs_per_8h) || 350)
      return (vol.packs / per8h) * HOURS_PER_DAY
    }
    case 'packaging': {
      const per8h = Math.max(1, Number(norms.packaging_packs_per_8h) || 800)
      const target = vol.packs || Math.floor(Number(order?.qty) || 0)
      return (target / per8h) * HOURS_PER_DAY
    }
    case 'otk':
      return (Number(norms.otk_minutes) || 0) / 60
    case 'drying':
      // Пассив — считается отдельно (см. PASSIVE_DRYING_DAYS), здесь 0.
      return 0
    case 'new':
    case 'color_approval':
    case 'done':
    case 'cancelled':
    default:
      return 0
  }
}

// Сколько рабочих дней «съедает» сушка (drying_hours ÷ 8). Округляем вверх.
// По умолчанию 36ч → 5 раб. дней? Нет — ТЗ §7.3 говорит «двигает на 2 раб. дня».
// 36ч/8ч = 4.5 кругло — но ТЗ явно говорит 2 раб. дня. Берём 2 как фикс,
// потому что сушка реальная (36ч ≈ 1.5 суток включая ночь, пользователь
// планирует уход в ночь и вытаскивает через день — итого 2 раб. дня).
export function dryingWaitDays(normsValue) {
  const norms = resolveNorms(normsValue)
  const hours = Number(norms.drying_hours) || 36
  // 8ч = 1 раб. день; 36ч с учётом ночей ≈ 2 раб. дня. Если админ поставит
  // другое число — пересчитаем линейно с разумным минимумом 1.
  if (hours <= 8) return 1
  if (hours <= 36) return 2
  return Math.max(1, Math.ceil(hours / 24))
}

// ============================================================
// Активные этапы заказа (что ещё надо спланировать)
// ============================================================

/**
 * Возвращает срез маршрута начиная с текущего status (включительно).
 * Этапы ДО status считаются пройденными и не планируются (§7.2 ТЗ).
 * cancelled / done → пустой массив.
 */
export function getActiveStages(order) {
  if (!order || !order.order_type) return []
  if (order.status === 'cancelled' || order.status === 'done') return []
  const route = getOrderRoute(order)
  const idx = route.indexOf(order.status)
  if (idx < 0) return route // грязные данные — планируем весь маршрут
  return route.slice(idx)
}

// ============================================================
// Главный планировщик
// ============================================================

/**
 * @param {Object} params
 * @param {Array} params.orders     — список заказов (k24_orders)
 * @param {Array} params.items      — все строки k24_order_items по заказам
 * @param {Array} params.overrides  — k24_plan_overrides
 * @param {Object} params.norms     — k24_settings.planning:norms
 * @param {Object} params.capacity  — k24_settings.planning:capacity
 * @param {Array}  params.holidays  — k24_settings.planning:holidays_2026
 * @param {Date}   params.today     — сегодняшняя дата (для тестов фиксируется)
 * @param {number} [params.horizonDays=30] — сколько рабочих дней раскладываем
 * @returns {{ days, orders, byOrder }}
 */
export function schedule({
  orders = [],
  items = [],
  overrides = [],
  norms,
  capacity,
  holidays = [],
  today,
  horizonDays = 30,
}) {
  const todayUtc = today ? startOfUTCDay(today) : startOfUTCDay(new Date())
  const cap = resolveCapacity(capacity)

  // 1. Список рабочих дней горизонта
  const workdays = getWorkingDays(todayUtc, horizonDays, holidays)
  const workdayISO = workdays.map(toISODate)
  const horizonLastISO = workdayISO[workdayISO.length - 1]

  // 2. Каркас days: { date, buckets: { [b]: { hours, capacity, items: [] } }, passives: [] }
  const days = workdays.map((d) => {
    const buckets = {}
    for (const b of VISIBLE_BUCKETS) {
      if (b === BUCKETS.passive) continue
      buckets[b] = {
        hours: 0,
        capacity: bucketHoursPerDay(b, cap),
        overload: false,
        items: [],
      }
    }
    return { date: toISODate(d), buckets, passives: [] }
  })

  const dayByISO = Object.fromEntries(days.map((d) => [d.date, d]))

  // 3. Индекс items и overrides по order_id для O(1) lookup
  const itemsByOrder = items.reduce((acc, it) => {
    const k = it.order_id
    if (!acc[k]) acc[k] = []
    acc[k].push(it)
    return acc
  }, {})

  const overrideKey = (orderId, stage) => `${orderId}::${stage}`
  const overrideByKey = overrides.reduce((acc, o) => {
    acc[overrideKey(o.order_id, o.stage)] = o.pinned_date
    return acc
  }, {})

  // 4. Сортируем заказы: rush первыми, потом по deadline по возрастанию
  const sorted = [...orders].sort((a, b) => {
    const aRush = (a.priority === 'urgent' || a.is_urgent) ? 0 : 1
    const bRush = (b.priority === 'urgent' || b.is_urgent) ? 0 : 1
    if (aRush !== bRush) return aRush - bRush
    const aD = a.deadline ? new Date(a.deadline).getTime() : Infinity
    const bD = b.deadline ? new Date(b.deadline).getTime() : Infinity
    return aD - bD
  })

  const byOrder = {}

  // 5. Раскладываем заказ за заказом
  for (const order of sorted) {
    const stages = getActiveStages(order)
    if (stages.length === 0) {
      byOrder[order.id] = {
        order_id: order.id,
        finishDay: null,
        deadlineDisplay: order.deadline ? toISODate(previousWorkingDay(new Date(order.deadline), holidays)) : null,
        late: false,
        risk: false,
        plannedStages: [],
        skipped: true,
      }
      continue
    }

    let availableFrom = todayUtc
    const plannedStages = []
    let finishDayISO = null
    let outOfHorizon = false

    for (const stage of stages) {
      const bucket = STAGE_TO_BUCKET[stage]
      const hours = getStageDurationHours(stage, order, itemsByOrder[order.id] || [], norms)

      if (bucket === BUCKETS.milestone || (hours <= 0 && bucket !== BUCKETS.passive)) {
        plannedStages.push({ stage, bucket, days: [], hours: 0, pinned: false })
        continue
      }

      if (bucket === BUCKETS.passive) {
        // drying — пассив. Не занимаем ёмкость, рисуем штриховку, двигаем
        // availableFrom на dryingWaitDays() рабочих дней.
        const waitDays = dryingWaitDays(norms)
        const startISO = toISODate(addWorkingDays(availableFrom, 0, holidays))
        // Рисуем пассив на 1 ячейку у бакета passive в день старта.
        const startDay = dayByISO[startISO]
        if (startDay) {
          startDay.passives.push({ order_id: order.id, stage, hours: Number(norms?.drying_hours) || 36 })
        }
        plannedStages.push({ stage, bucket, days: [startISO], hours: 0, pinned: false })
        availableFrom = addWorkingDays(availableFrom, waitDays, holidays)
        continue
      }

      // Обычный этап. Override → весь блок в pinned_date.
      const pinned = overrideByKey[overrideKey(order.id, stage)]
      if (pinned) {
        const day = dayByISO[pinned]
        if (day && day.buckets[bucket]) {
          day.buckets[bucket].hours += hours
          day.buckets[bucket].items.push({
            order_id: order.id, stage, hours, pinned: true,
          })
        }
        plannedStages.push({ stage, bucket, days: [pinned], hours, pinned: true })
        const pinnedDate = fromISODate(pinned)
        finishDayISO = pinned
        availableFrom = addWorkingDays(pinnedDate, 1, holidays)
        continue
      }

      // Жадно заполняем дни начиная с availableFrom.
      let remaining = hours
      const startISO = toISODate(addWorkingDays(availableFrom, 0, holidays))
      const startIdx = workdayISO.indexOf(startISO)
      const usedDays = []
      let lastDayISO = null
      if (startIdx < 0) {
        outOfHorizon = true
      } else {
        for (let i = startIdx; i < workdayISO.length && remaining > 0; i += 1) {
          const day = days[i]
          const slot = day.buckets[bucket]
          if (!slot) continue
          const free = Math.max(0, slot.capacity - slot.hours)
          if (free <= 0) continue
          const used = Math.min(free, remaining)
          slot.hours += used
          slot.items.push({ order_id: order.id, stage, hours: used, pinned: false })
          usedDays.push(day.date)
          lastDayISO = day.date
          remaining -= used
        }
        if (remaining > 0) outOfHorizon = true
      }
      plannedStages.push({ stage, bucket, days: usedDays, hours: hours - remaining, pinned: false })
      if (lastDayISO) {
        finishDayISO = lastDayISO
        availableFrom = addWorkingDays(fromISODate(lastDayISO), 1, holidays)
      }
    }

    // Отметить перегруз постфактум (могло появиться при pinned).
    for (const day of days) {
      for (const b of Object.keys(day.buckets)) {
        const slot = day.buckets[b]
        slot.overload = slot.hours > slot.capacity + 1e-6
      }
    }

    const deadlineDisplay = order.deadline
      ? toISODate(previousWorkingDay(new Date(order.deadline), holidays))
      : null
    const finishMs = finishDayISO ? new Date(finishDayISO).getTime() : null
    const deadlineMs = deadlineDisplay ? new Date(deadlineDisplay).getTime() : null
    const late = outOfHorizon || (finishMs && deadlineMs && finishMs > deadlineMs)
    const risk = !late && finishMs && deadlineMs && finishMs === deadlineMs

    byOrder[order.id] = {
      order_id: order.id,
      finishDay: outOfHorizon ? horizonLastISO : finishDayISO,
      deadlineDisplay,
      late: !!late,
      risk: !!risk,
      outOfHorizon,
      plannedStages,
    }
  }

  // Финализация overload по всем дням и бакетам
  for (const day of days) {
    for (const b of Object.keys(day.buckets)) {
      const slot = day.buckets[b]
      slot.overload = slot.hours > slot.capacity + 1e-6
    }
  }

  return {
    days,
    horizon: { startISO: workdayISO[0], endISO: horizonLastISO, length: workdayISO.length },
    byOrder,
    orders: Object.values(byOrder),
  }
}

// Реэкспорты для удобства потребителей
export { DEFAULT_NORMS, ORDER_STATUSES }
