import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { captureError } from '@/shared/lib/sentry'
import { subDays, startOfMonth, startOfDay, endOfDay, format, parseISO } from 'date-fns'
import { calculateWorkerPayout, settingsToRates, WORKER_RATES } from '@/shared/constants'
import { fetchShapeByDesign, orderShapeFromLogs, shapeForLog, pouringRateForShape } from '@/shared/lib/payout-context'

// R13.3 (бриф 02.06): период расширен — `today` (с начала дня), `custom:from:to`
// (YYYY-MM-DD строки), плюс legacy '7' / '30' / 'month'.
export function getSince(period) {
  if (typeof period === 'string' && period.startsWith('custom:')) {
    const [, from] = period.split(':')
    if (from) return startOfDay(parseISO(from)).toISOString()
  }
  if (period === 'today') return startOfDay(new Date()).toISOString()
  if (period === 'month') return startOfMonth(new Date()).toISOString()
  return subDays(new Date(), parseInt(period) || 30).toISOString()
}

// Возвращает верхнюю границу для custom-периода и `today`; для остальных пресетов
// возвращает null (вызывающая сторона не вешает .lte).
export function getUntil(period) {
  if (typeof period === 'string' && period.startsWith('custom:')) {
    const [, , to] = period.split(':')
    if (to) return endOfDay(parseISO(to)).toISOString()
  }
  if (period === 'today') return endOfDay(new Date()).toISOString()
  return null
}


export function useWorkSchedule(period = '30') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: shifts, error: err } = await supabase
        .from('k24_shift_entries')
        .select('*, worker:k24_profiles!worker_id(display_name)')
        .not('ended_at', 'is', null)
        .gte('started_at', getSince(period)).lte('started_at', getUntil(period) ?? '9999-12-31T23:59:59Z')
        .order('started_at', { ascending: false })
      if (err) throw err

      const byWorker = {}
      ;(shifts || []).forEach((s) => {
        const name = s.worker?.display_name || 'Неизвестный'
        const day = format(new Date(s.started_at), 'dd.MM')
        if (!byWorker[name]) byWorker[name] = { name, days: {}, totalMinutes: 0 }
        if (!byWorker[name].days[day]) byWorker[name].days[day] = 0
        byWorker[name].days[day] += s.duration_minutes || 0
        byWorker[name].totalMinutes += s.duration_minutes || 0
      })
      setData(Object.values(byWorker))
    } catch (err) {
      captureError(err, { tags: { source: 'reports.useWorkSchedule' }, extra: { period } })
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])
  useRefetchOnFocus(fetchData)

  return { data, loading, error, refetch: fetchData }
}

export function useOrdersCostReport(period = '30') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Расширенный набор полей для Unit Economics / P&L / Расходы по заказам
      // (R8.5 серии 25.05). Подтягиваем клиента, ламинацию, плёнку, оплату,
      // дедлайны, доставку — всё нужно для итоговых таблиц.
      const [ordersRes, logsRes, ratesRes] = await Promise.all([
        // Финансы — через маскирующее view k24_orders_full (security phase 3).
        supabase.from('k24_orders_full')
          .select(`id, number, custom_number, order_type, qty, price_final,
                   cost_materials, cost_labor, cost_total, status,
                   created_at, deadline, width_mm, height_mm,
                   film_type, film_type_stickers, lam_type, need_lam,
                   film_material_id, film_stickers_material_id, lam_material_id, sticker_shape,
                   stickers_per_pack, notes, delivery_type, payment_status,
                   client:k24_clients!client_id(name),
                   film_material:k24_materials!film_material_id(id, name, material_code, unit_cost),
                   film_stickers_material:k24_materials!film_stickers_material_id(id, name, material_code, unit_cost),
                   lam_material:k24_materials!lam_material_id(id, name, material_code, unit_cost)`)
          .gte('created_at', getSince(period)).lte('created_at', getUntil(period) ?? '9999-12-31T23:59:59Z')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('k24_production_logs')
          .select(`order_id, stage, defects, design_index, film_meters, resin_grams, lamination_meters,
                   film_type, track, stickers_printed, stickers_poured,
                   stickers_good, packs_assembled, packs_packaged, qty_selected,
                   boxes_used,
                   order:k24_orders!order_id(lam_type, film_type, film_type_stickers, order_type)`)
          .is('deleted_at', null)
          .gte('created_at', getSince(period)).lte('created_at', getUntil(period) ?? '9999-12-31T23:59:59Z')
          .limit(10000),
        supabase.from('k24_settings').select('value').eq('key', 'bonus_rates').single(),
      ])
      if (ordersRes.error) throw ordersRes.error
      if (logsRes.error) throw logsRes.error
      // ratesRes.error PGRST116 (нет строки) — ок, дефолтные ставки

      // R20.4 (бриф 3.07): виды изделий для подстрок 107.1 / 107.2 / … в Unit Economics.
      const orderIds = (ordersRes.data || []).map((o) => o.id)
      const itemsByOrder = {}
      if (orderIds.length > 0) {
        const { data: itemsData, error: itemsErr } = await supabase
          .from('k24_order_items')
          .select('order_id, idx, width_mm, height_mm, qty')
          .in('order_id', orderIds)
          .order('idx', { ascending: true })
        if (itemsErr) throw itemsErr
        for (const it of itemsData || []) (itemsByOrder[it.order_id] ||= []).push(it)
      }

      // R19: ставки из настроек + формы стикеров для дифф. оплаты заливки.
      const payoutRates = settingsToRates(ratesRes.data?.value)
      const shapeByDesign = await fetchShapeByDesign((logsRes.data || []).map((l) => l.order_id))
      const orderShape = {}
      ;(ordersRes.data || []).forEach((o) => {
        if (o.sticker_shape && o.sticker_shape !== 'standard') orderShape[o.id] = o.sticker_shape
      })

      // ordersById — нужен calculateWorkerPayout для stickers_per_pack.
      const ordersById = Object.fromEntries((ordersRes.data || []).map((o) => [o.id, o]))
      // rawLogsByOrder — сырые логи по заказу для прогона через calculateWorkerPayout.
      const rawLogsByOrder = {}

      const logsByOrder = {}
      ;(logsRes.data || []).forEach((l) => {
        if (!logsByOrder[l.order_id]) {
          logsByOrder[l.order_id] = {
            film: 0, resin: 0, lam: 0,
            filmByType: {}, lamByType: {},
            stickers_printed: 0, stickers_poured: 0, stickers_good: 0,
            packs_assembled: 0, packs_packaged: 0, qty_selected: 0,
            boxes_used: 0, drying_defects: 0,
            payouts: 0,
          }
        }
        ;(rawLogsByOrder[l.order_id] ||= []).push(l)
        const acc = logsByOrder[l.order_id]
        // R18.0: брак сушки — числитель для % брака заливки в Unit Economics.
        if (l.stage === 'drying') acc.drying_defects += Number(l.defects) || 0
        const filmM = Number(l.film_meters) || 0
        const resinG = Number(l.resin_grams) || 0
        const lamM = Number(l.lamination_meters) || 0

        acc.film += filmM
        acc.resin += resinG
        acc.lam += lamM
        // R14.6 hotfix: после R8 поле film_type в логах больше не пишется (берётся
        // из заказа). Fallback: для stickerpack3D track='stickers' — film_type_stickers,
        // иначе — film_type заказа.
        const isPackStickerTrack = l.order?.order_type === 'stickerpack3D' && l.track === 'stickers'
        const ft = l.film_type || (isPackStickerTrack ? l.order?.film_type_stickers : l.order?.film_type)
        if (ft && filmM > 0) acc.filmByType[ft] = (acc.filmByType[ft] || 0) + filmM
        const logLamType = l.order?.lam_type
        if (logLamType && lamM > 0) acc.lamByType[logLamType] = (acc.lamByType[logLamType] || 0) + lamM
        acc.stickers_printed += Number(l.stickers_printed) || 0
        acc.stickers_poured += Number(l.stickers_poured) || 0
        acc.stickers_good += Number(l.stickers_good) || 0
        acc.packs_assembled += Number(l.packs_assembled) || 0
        acc.packs_packaged += Number(l.packs_packaged) || 0
        acc.qty_selected += Number(l.qty_selected) || 0
        acc.boxes_used += Number(l.boxes_used) || 0
      })

      const rows = (ordersRes.data || []).map((o) => {
        const lg = logsByOrder[o.id] || { film: 0, resin: 0, lam: 0, stickers_printed: 0, stickers_poured: 0, stickers_good: 0, packs_assembled: 0, packs_packaged: 0, qty_selected: 0, boxes_used: 0, drying_defects: 0, filmByType: {}, lamByType: {} }
        // R18.0 (бриф 30.06): % брака = брак на сушке / залито (нас интересует
        // брак именно после заливки, который фиксируется на этапе сушки).
        // Обе величины в штуках стикеров — единицы согласованы.
        const dryingDefects = lg.drying_defects || 0
        const rejectPct = lg.stickers_poured > 0 ? Math.round((dryingDefects / lg.stickers_poured) * 100) : 0
        // Излишки шт = залито − тираж − брак. Для стикерпаков «тираж» в стикерах =
        // qty × stickers_per_pack (qty у пака — число паков, а заливка — штучная),
        // для остальных типов тираж = qty. % — от тиража (решение пользователя).
        const isPack = o.order_type === 'stickerpack' || o.order_type === 'stickerpack3D'
        // Multi-variant (R20.5): произведённое суммируется по всем размерным
        // видам, поэтому и база тиража = сумма qty видов (o.qty — тираж вида 1).
        // Для single-variant items может рассинхронизироваться с o.qty после
        // ручной правки заказа (триггер 038 не обновляет item) — берём o.qty.
        const orderItems = itemsByOrder[o.id] || []
        const baseQty = orderItems.length > 1
          ? orderItems.reduce((s, it) => s + (Number(it.qty) || 0), 0)
          : (o.qty || 0)
        const targetStickers = isPack ? baseQty * (Number(o.stickers_per_pack) || 1) : baseQty
        const surplus = lg.stickers_poured > 0 && targetStickers > 0 ? lg.stickers_poured - targetStickers - dryingDefects : 0
        const surplusPct = targetStickers > 0 ? Math.round((surplus / targetStickers) * 100) : 0
        // Стоимость труда — фактический сдельный расчёт по всем логам заказа
        // (заливка/выборка/сборка/упаковка), а не ручное поле cost_labor.
        const laborCost = calculateWorkerPayout(rawLogsByOrder[o.id] || [], { ordersById, rates: payoutRates, shapeByDesign, orderShape }).total
        return {
          ...o,
          client_name: o.client?.name || null,
          items: itemsByOrder[o.id] || [],
          actual_film: lg.film,
          actual_resin: lg.resin,
          actual_lam: lg.lam,
          actual_film_by_type: lg.filmByType,
          actual_lam_by_type: lg.lamByType,
          stickers_printed: lg.stickers_printed,
          stickers_poured: lg.stickers_poured,
          stickers_good: lg.stickers_good,
          packs_assembled: lg.packs_assembled,
          packs_packaged: lg.packs_packaged,
          qty_selected: lg.qty_selected,
          boxes_used: lg.boxes_used,
          drying_defects: dryingDefects,
          reject_pct: rejectPct, surplus, surplus_pct: surplusPct,
          labor_cost: laborCost,
          profit: (Number(o.price_final) || 0) - (Number(o.cost_total) || 0),
          margin_pct: o.price_final > 0 ? Math.round(((o.price_final - o.cost_total) / o.price_final) * 100) : 0,
        }
      })
      setData(rows)
    } catch (err) {
      captureError(err, { tags: { source: 'reports.useOrdersCostReport' }, extra: { period } })
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])
  useRefetchOnFocus(fetchData)

  return { data, loading, error, refetch: fetchData }
}

export function useBonusReport(period = '30') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [logsRes, ratesRes] = await Promise.all([
        supabase.from('k24_production_logs')
          .select('worker_id, stage, order_id, design_index, stickers_good, packs_assembled, packs_packaged, qty_selected, worker:k24_profiles!worker_id(display_name), order:k24_orders!order_id(order_type, stickers_per_pack, sticker_shape)')
          .is('deleted_at', null)
          .gte('created_at', getSince(period)).lte('created_at', getUntil(period) ?? '9999-12-31T23:59:59Z').limit(10000),
        supabase.from('k24_settings').select('value').eq('key', 'bonus_rates').single(),
      ])
      if (logsRes.error) throw logsRes.error
      // ratesRes.error может быть PGRST116 (no rows) — это норм, используем default rates
      if (ratesRes.error && ratesRes.error.code !== 'PGRST116') throw ratesRes.error

      // Фолбэк синхронизирован с WORKER_RATES: без pouring_shapes сложные формы
      // оплачивались бы по 1 ₽, расходясь с calculateWorkerPayout (Unit Economics).
      const rates = ratesRes.data?.value || {
        pouring: 1, assembly_3d: 0.5, packaging: 1.5, selection: 0.5,
        pouring_shapes: WORKER_RATES.pouring_by_shape,
      }
      // R19: формы стикеров для дифф. оплаты заливки.
      const shapeByDesign = await fetchShapeByDesign((logsRes.data || []).map((l) => l.order_id))
      const orderShape = orderShapeFromLogs(logsRes.data)

      const byWorker = {}
      ;(logsRes.data || []).forEach((l) => {
        const name = l.worker?.display_name || 'Неизвестный'
        if (!byWorker[name]) byWorker[name] = { name, resin: 0, assembly: 0, packaging: 0, selection: 0, total: 0 }

        if (l.stickers_good) {
          const pRate = pouringRateForShape(shapeForLog(l, shapeByDesign, orderShape), rates)
          byWorker[name].resin += l.stickers_good; byWorker[name].total += l.stickers_good * pRate
        }
        if (l.packs_assembled) {
          // Сборка 3D: packs × stickers_per_pack × ставка (фидбэк 12.05)
          const perPack = Number(l.order?.stickers_per_pack) || 1
          byWorker[name].assembly += l.packs_assembled
          byWorker[name].total += l.packs_assembled * perPack * (rates.assembly_3d || 0)
        }
        if (l.packs_packaged) { byWorker[name].packaging += l.packs_packaged; byWorker[name].total += l.packs_packaged * (rates.packaging || 0) }
        if (l.qty_selected) {
          // Выборка фонов — каждый фон = N стикеров (×stickers_per_pack).
          // R22.7 (ТЗ Фаза 8): для stickerpack3D «Выборка» (stage='selection')
          // = выборка фонов, оплата ×stickers_per_pack (как исторический
          // selection_pouring). sticker3D «Выборка» штучная — ×1.
          const isBgSelection = l.stage === 'selection_pouring'
            || (l.stage === 'selection' && l.order?.order_type === 'stickerpack3D')
          const perPack = isBgSelection ? (Number(l.order?.stickers_per_pack) || 1) : 1
          byWorker[name].selection += l.qty_selected
          byWorker[name].total += l.qty_selected * perPack * (rates.selection || 0)
        }
      })

      setData(Object.values(byWorker).sort((a, b) => b.total - a.total))
    } catch (err) {
      captureError(err, { tags: { source: 'reports.useBonusReport' }, extra: { period } })
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])
  useRefetchOnFocus(fetchData)

  return { data, loading, error, refetch: fetchData }
}

/**
 * Сводный отчёт по сотрудникам (R8.5 серии 25.05):
 * часы + сдельная оплата + цифровые показатели (залито/выбрано/собрано/упаковано)
 * — всё в одном виджете на сотрудника.
 */
export function useEmployeeReport(period = '30') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [shiftsRes, logsRes, ratesRes] = await Promise.all([
        supabase.from('k24_shift_entries')
          .select('worker_id, duration_minutes, started_at, ended_at, worker:k24_profiles!worker_id(display_name)')
          .not('ended_at', 'is', null)
          .gte('started_at', getSince(period)).lte('started_at', getUntil(period) ?? '9999-12-31T23:59:59Z'),
        supabase.from('k24_production_logs')
          .select('worker_id, stage, order_id, design_index, created_at, stickers_good, packs_assembled, packs_packaged, qty_selected, stickers_printed, lamination_qty, qty_cut, worker:k24_profiles!worker_id(display_name), order:k24_orders!order_id(order_type, stickers_per_pack, sticker_shape)')
          .is('deleted_at', null)
          .gte('created_at', getSince(period)).lte('created_at', getUntil(period) ?? '9999-12-31T23:59:59Z')
          .limit(10000),
        supabase.from('k24_settings').select('value').eq('key', 'bonus_rates').single(),
      ])
      if (shiftsRes.error) throw shiftsRes.error
      if (logsRes.error) throw logsRes.error
      if (ratesRes.error && ratesRes.error.code !== 'PGRST116') throw ratesRes.error

      const rates = ratesRes.data?.value || {
        pouring: 1, assembly_3d: 0.5, packaging: 1.5, selection: 0.5,
        pouring_shapes: WORKER_RATES.pouring_by_shape,
      }
      // R19: формы стикеров для дифф. оплаты заливки.
      const shapeByDesign = await fetchShapeByDesign((logsRes.data || []).map((l) => l.order_id))
      const orderShape = orderShapeFromLogs(logsRes.data)
      const byWorker = {}

      function ensure(workerId, name) {
        if (!byWorker[workerId]) {
          byWorker[workerId] = {
            worker_id: workerId, name,
            totalMinutes: 0, days: {},
            payout: 0,
            poured: 0, selected: 0, assembled: 0, packaged: 0,
            printed: 0, laminated: 0, cut: 0,
          }
        }
        return byWorker[workerId]
      }

      // R22.2 (ТЗ 20.07 Фаза 2): подневная детализация для Excel-отчёта.
      // days[dd.MM.yy] = { minutes, poured, selected, assembled, packaged, payout }.
      function ensureDay(w, day) {
        if (!w.days[day]) {
          w.days[day] = { minutes: 0, poured: 0, selected: 0, assembled: 0, packaged: 0, payout: 0 }
        }
        return w.days[day]
      }

      ;(shiftsRes.data || []).forEach((s) => {
        const w = ensure(s.worker_id, s.worker?.display_name || 'Неизвестный')
        w.totalMinutes += s.duration_minutes || 0
        const day = format(new Date(s.started_at), 'dd.MM.yy')
        ensureDay(w, day).minutes += s.duration_minutes || 0
      })

      ;(logsRes.data || []).forEach((l) => {
        if (!l.worker_id) return
        const w = ensure(l.worker_id, l.worker?.display_name || 'Неизвестный')
        const day = l.created_at ? format(new Date(l.created_at), 'dd.MM.yy') : null
        const d = day ? ensureDay(w, day) : null
        const perPack = Number(l.order?.stickers_per_pack) || 1
        // R14.6/R22.7: выборка фонов (selection_pouring ИЛИ selection у
        // stickerpack3D) множится на stickers_per_pack; штучная выборка
        // sticker3D (selection) — ×1.
        const isBgSelection = l.stage === 'selection_pouring'
          || (l.stage === 'selection' && l.order?.order_type === 'stickerpack3D')
        const selectionMult = isBgSelection ? perPack : 1
        if (l.stickers_good) {
          const pRate = pouringRateForShape(shapeForLog(l, shapeByDesign, orderShape), rates)
          const pay = l.stickers_good * pRate
          w.poured += l.stickers_good; w.payout += pay
          if (d) { d.poured += l.stickers_good; d.payout += pay }
        }
        if (l.qty_selected) {
          const pay = l.qty_selected * selectionMult * (rates.selection || 0)
          w.selected += l.qty_selected; w.payout += pay
          if (d) { d.selected += l.qty_selected; d.payout += pay }
        }
        if (l.packs_assembled) {
          const pay = l.packs_assembled * perPack * (rates.assembly_3d || 0)
          w.assembled += l.packs_assembled; w.payout += pay
          if (d) { d.assembled += l.packs_assembled; d.payout += pay }
        }
        if (l.packs_packaged) {
          const pay = l.packs_packaged * (rates.packaging || 0)
          w.packaged += l.packs_packaged; w.payout += pay
          if (d) { d.packaged += l.packs_packaged; d.payout += pay }
        }
        if (l.stickers_printed) w.printed += l.stickers_printed
        if (l.lamination_qty) w.laminated += l.lamination_qty
        if (l.qty_cut) w.cut += l.qty_cut
      })

      const rows = Object.values(byWorker).sort((a, b) => b.totalMinutes - a.totalMinutes)
      setData(rows)
    } catch (err) {
      captureError(err, { tags: { source: 'reports.useEmployeeReport' }, extra: { period } })
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])
  useRefetchOnFocus(fetchData)

  return { data, loading, error, refetch: fetchData }
}

export function useQualityReport(period = '30') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ordersRes, logsRes] = await Promise.all([
        supabase.from('k24_orders').select('id, number, custom_number, qty, order_type')
          .gte('created_at', getSince(period)).lte('created_at', getUntil(period) ?? '9999-12-31T23:59:59Z').order('number').limit(500),
        supabase.from('k24_production_logs')
          .select('order_id, stickers_printed, stickers_poured, stickers_good')
          .is('deleted_at', null)
          .gte('created_at', getSince(period)).lte('created_at', getUntil(period) ?? '9999-12-31T23:59:59Z').limit(10000),
      ])
      if (ordersRes.error) throw ordersRes.error
      if (logsRes.error) throw logsRes.error

      const logsByOrder = {}
      ;(logsRes.data || []).forEach((l) => {
        if (!logsByOrder[l.order_id]) logsByOrder[l.order_id] = { printed: 0, poured: 0, good: 0 }
        logsByOrder[l.order_id].printed += l.stickers_printed || 0
        logsByOrder[l.order_id].poured += l.stickers_poured || 0
        logsByOrder[l.order_id].good += l.stickers_good || 0
      })

      const rows = (ordersRes.data || [])
        .filter((o) => logsByOrder[o.id])
        .map((o) => {
          const l = logsByOrder[o.id]
          const rejected = l.poured > 0 ? l.poured - l.good : 0
          const rejectPct = l.poured > 0 ? Math.round((rejected / l.poured) * 100) : 0
          const surplus = l.printed > 0 ? l.printed - o.qty : 0
          const surplusPct = o.qty > 0 ? Math.round((surplus / o.qty) * 100) : 0
          return { ...o, ...l, rejected, rejectPct, surplus, surplusPct }
        })
      setData(rows)
    } catch (err) {
      captureError(err, { tags: { source: 'reports.useQualityReport' }, extra: { period } })
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])
  useRefetchOnFocus(fetchData)

  return { data, loading, error, refetch: fetchData }
}
