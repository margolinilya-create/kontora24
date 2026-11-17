import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import {
  calculateWorkerPayout, settingsToRates, getStatusMeta,
} from '@/shared/constants'
import { captureError } from '@/shared/lib/sentry'
import {
  aggregateMaterialUsage, buildCostMap, costForOrder, withMaterialUnitCosts,
} from '@/features/reports/lib/materials-cost'
import { fetchShapeByDesign, orderShapeFromLogs } from '@/shared/lib/payout-context'
import { fetchAllRows } from '@/shared/lib/fetch-all'
import { CONSUMPTION_KINDS } from '@/features/warehouse/lib/warehouse-journal'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { subDays, subMonths, subWeeks, startOfWeek, startOfDay, endOfDay, format, differenceInHours, getISOWeek, parseISO } from 'date-fns'
import { formatOrderType } from '@/shared/lib/utils'

export const PERIODS = [
  { key: 'today', label: 'Сегодня' },
  { key: '7d', label: '7 дней' },
  { key: '30d', label: '30 дней' },
  { key: '90d', label: '3 месяца' },
  { key: 'all', label: 'Всё время' },
  { key: 'custom', label: 'Свой' },
]

/**
 * Распарсить ключ периода в { startDate, endDate }.
 * Поддерживает базовые ключи + custom-формат `custom:YYYY-MM-DD:YYYY-MM-DD`.
 * Для 'all' возвращает большой исторический диапазон.
 * R15.2 (бриф 04.06 #9): добавлен today + произвольный диапазон.
 */
export function parsePeriod(period) {
  const now = new Date()
  if (typeof period === 'string' && period.startsWith('custom:')) {
    const [, fromIso, toIso] = period.split(':')
    if (fromIso && toIso) {
      return { startDate: startOfDay(parseISO(fromIso)), endDate: endOfDay(parseISO(toIso)) }
    }
  }
  switch (period) {
    case 'today':
      return { startDate: startOfDay(now), endDate: endOfDay(now) }
    case '7d':
      return { startDate: subDays(now, 7), endDate: now }
    case '90d':
      return { startDate: subMonths(now, 3), endDate: now }
    case 'all':
      return { startDate: new Date('2020-01-01'), endDate: now }
    case '30d':
    default:
      return { startDate: subDays(now, 30), endDate: now }
  }
}

export function useAnalyticsData(period) {
  const [data, setData] = useState({
    orders: [], statusHistory: [], materialTx: [], prevOrders: [], productionLogs: [],
    payoutRates: undefined, shapeByDesign: {}, orderShape: {}, materials: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { startDate, endDate } = parsePeriod(period)
      const periodMs = endDate.getTime() - startDate.getTime()
      const prevStart = new Date(startDate.getTime() - periodMs)
      const sinceIso = startDate.toISOString()
      const untilIso = endDate.toISOString()

      // PostgREST отдаёт ≤ 1000 строк за запрос — `.limit(10000)` молча
      // резался до тысячи (код-ревью 17.11). Всё грузим порциями с
      // детерминированным порядком (created_at, id).
      const ORDER_COLS = 'id, number, status, order_type, qty, price_final, cost_total, cost_labor, cost_materials, film_type, film_type_stickers, lam_type, film_material_id, film_stickers_material_id, lam_material_id, montage_material_id, contractor_cost, stickers_per_pack, sticker_shape, bopp_bag, route_version, route_snapshot, deadline, created_at, updated_at, client:k24_clients(name), client_id, assignee:k24_profiles!assigned_to(display_name)'
      // Embed заказа в логе: оплата лога по заказу, созданному ДО периода,
      // иначе считалась бы с order=null (сборка/выборка ×1 вместо
      // ×stickers_per_pack, упаковка v2 оплачивалась бы ошибочно).
      // Колонки нефинансовые — доступны authenticated (GRANT 072/093).
      const LOG_COLS = 'id, order_id, stage, track, design_index, worker_id, stickers_printed, backgrounds_printed, stickers_good, stickers_poured, qty_selected, qty_cut, packs_assembled, packs_packaged, prepared_qty, sample_film_meters, film_meters, film_type, lamination_meters, montage_meters, boxes_used, lamination_qty, qty_done, resin_grams, defects, created_at, worker:k24_profiles!worker_id(display_name), order:k24_orders!order_id(order_type, stickers_per_pack, sticker_shape, bopp_bag, route_version, route_snapshot)'
      const [orders, history, matTx, prevOrders, logs, ratesRes, materialsRes] = await Promise.all([
        // Финансы читаем через маскирующее view k24_orders_full (security
        // phase 3): базовая таблица после миграции 072 не отдаёт финколонки
        // authenticated. У k24_orders НЕТ колонки deleted_at (soft-delete
        // только у логов) — фильтр по ней ронял страницу с 400 (QA 04.07 №1).
        fetchAllRows(() => supabase.from('k24_orders_full').select(ORDER_COLS).gte('created_at', sinceIso).lte('created_at', untilIso).order('created_at').order('id')),
        fetchAllRows(() => supabase.from('k24_order_status_history').select('id, order_id, from_status, to_status, created_at').gte('created_at', sinceIso).lte('created_at', untilIso).order('created_at').order('id')),
        // Расход материалов — только списания по заказам и ручной расход
        // (инвентаризация/корректировка — не расход, R25.8 kind).
        fetchAllRows(() => supabase.from('k24_material_transactions').select('id, material_id, delta, reason, kind, created_at, material:k24_materials(name, type, unit)').in('kind', CONSUMPTION_KINDS).gte('created_at', sinceIso).lte('created_at', untilIso).order('created_at').order('id')),
        period !== 'all'
          ? fetchAllRows(() => supabase.from('k24_orders_full').select('id, status, price_final').gte('created_at', prevStart.toISOString()).lt('created_at', sinceIso).order('created_at').order('id'))
          : Promise.resolve([]),
        fetchAllRows(() => supabase.from('k24_production_logs').select(LOG_COLS).is('deleted_at', null).gte('created_at', sinceIso).lte('created_at', untilIso).order('created_at').order('id')),
        supabase.from('k24_settings').select('value').eq('key', 'bonus_rates').maybeSingle(),
        // Себестоимость материалов — по средней цене склада (WAC), как в
        // отчётах. unit_cost маскируется view без view:finance (→ 0).
        supabase.from('k24_materials_full').select('id, name, type, material_code, unit_cost, archived_at'),
      ])
      if (ratesRes.error) throw ratesRes.error
      if (materialsRes.error) throw materialsRes.error

      // R19: ставки из настроек + формы стикеров для дифф. оплаты заливки.
      const payoutRates = settingsToRates(ratesRes.data?.value)
      const shapeByDesign = await fetchShapeByDesign(logs.map((l) => l.order_id))
      // Форма стикера: из embed'а лога (заказы вне периода) + из заказов периода.
      const orderShape = orderShapeFromLogs(logs)
      orders.forEach((o) => {
        if (o.sticker_shape && o.sticker_shape !== 'standard') orderShape[o.id] = o.sticker_shape
      })

      setData({
        orders,
        statusHistory: history,
        materialTx: matTx,
        prevOrders,
        productionLogs: logs,
        payoutRates, shapeByDesign, orderShape,
        materials: materialsRes.data || [],
      })
    } catch (err) {
      captureError(err, { tags: { source: 'analytics.useAnalyticsData' }, extra: { period } })
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])
  useRefetchOnFocus(fetchData)

  const orders = data.orders

  // Группируем логи по order_id для расчёта фактической себестоимости и payroll
  const logsByOrder = useMemo(() => {
    const map = {}
    for (const l of data.productionLogs) {
      if (!map[l.order_id]) map[l.order_id] = []
      map[l.order_id].push(l)
    }
    return map
  }, [data.productionLogs])

  // ordersById — для calculateWorkerPayout (нужен stickers_per_pack для выборки и сборки 3D)
  const ordersById = useMemo(() => {
    const m = {}
    for (const o of orders) m[o.id] = o
    return m
  }, [orders])

  const costMap = useMemo(() => buildCostMap(data.materials), [data.materials])
  const materialsById = useMemo(
    () => Object.fromEntries((data.materials || []).map((m) => [m.id, m])),
    [data.materials],
  )

  // Заказы с расчётной себестоимостью (приоритет: фактическая, fallback — ручная).
  // Материалы — WAC (costForOrder, как в отчётах), а не жёсткий MATERIAL_COSTS.
  // Расход — по логам периода (как и раньше в аналитике).
  const ordersEnriched = useMemo(() => orders.map((o) => {
    const logs = logsByOrder[o.id] || []
    const materials = costForOrder(
      { ...withMaterialUnitCosts(o, materialsById), ...aggregateMaterialUsage(logs, o) },
      costMap,
    )
    const payout = calculateWorkerPayout(logs, { ordersById, rates: data.payoutRates, shapeByDesign: data.shapeByDesign, orderShape: data.orderShape })
    // R25.4: работа подрядчика — часть себестоимости (как в P&L отчётов).
    const computedCost = materials.total + payout.total + materials.contractor
    const fallbackCost = Number(o.cost_total) || (Number(o.cost_materials) || 0) + (Number(o.cost_labor) || 0)
    return {
      ...o,
      _computedCost: computedCost > 0 ? computedCost : fallbackCost,
      _payout: payout.total,
    }
  }), [orders, logsByOrder, ordersById, costMap, materialsById, data.payoutRates, data.shapeByDesign, data.orderShape])

  const doneOrders = useMemo(() => ordersEnriched.filter((o) => o.status === 'done'), [ordersEnriched])
  const revenue = useMemo(() => doneOrders.reduce((s, o) => s + (Number(o.price_final) || 0), 0), [doneOrders])
  const totalCost = useMemo(() => doneOrders.reduce((s, o) => s + (o._computedCost || 0), 0), [doneOrders])
  const totalPayout = useMemo(() => doneOrders.reduce((s, o) => s + (o._payout || 0), 0), [doneOrders])
  const avgCheck = doneOrders.length > 0 ? revenue / doneOrders.length : 0
  const cancelledCount = orders.filter((o) => o.status === 'cancelled').length
  const conversionRate = orders.length > 0 ? ((doneOrders.length / orders.length) * 100).toFixed(1) : '—'

  const prevDone = (data.prevOrders || []).filter((o) => o.status === 'done')
  const prevRevenue = prevDone.reduce((s, o) => s + (Number(o.price_final) || 0), 0)
  const revenueDelta = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue * 100).toFixed(0) : null

  const typeData = useMemo(() => {
    const byType = {}
    doneOrders.forEach((o) => {
      if (!byType[o.order_type]) byType[o.order_type] = { revenue: 0, count: 0, cost: 0 }
      byType[o.order_type].revenue += Number(o.price_final) || 0
      byType[o.order_type].cost += o._computedCost || 0
      byType[o.order_type].count += 1
    })
    return Object.entries(byType).map(([type, d]) => ({
      name: formatOrderType(type), ...d, margin: d.revenue - d.cost,
    }))
  }, [doneOrders])

  const statusData = useMemo(() => {
    const byStatus = {}
    orders.forEach((o) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1 })
    return Object.entries(byStatus).map(([s, v]) => ({ name: getStatusMeta(s)?.label || s, value: v }))
  }, [orders])

  const avgStageData = useMemo(() => {
    const stageTimes = {}
    const orderHistoryMap = {}
    data.statusHistory.forEach((h) => {
      if (!orderHistoryMap[h.order_id]) orderHistoryMap[h.order_id] = []
      orderHistoryMap[h.order_id].push(h)
    })
    Object.values(orderHistoryMap).forEach((history) => {
      history.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      for (let i = 1; i < history.length; i++) {
        const stage = history[i - 1].to_status
        const hours = differenceInHours(new Date(history[i].created_at), new Date(history[i - 1].created_at))
        if (!stageTimes[stage]) stageTimes[stage] = []
        stageTimes[stage].push(hours)
      }
    })
    return Object.entries(stageTimes).map(([stage, times]) => ({
      name: getStatusMeta(stage)?.label || stage,
      hours: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    })).filter((d) => d.hours > 0)
  }, [data.statusHistory])

  const trendData = useMemo(() => {
    const revenueTrend = {}
    doneOrders.forEach((o) => {
      const day = format(new Date(o.created_at), 'dd.MM')
      if (!revenueTrend[day]) revenueTrend[day] = 0
      revenueTrend[day] += Number(o.price_final) || 0
    })
    return Object.entries(revenueTrend).map(([day, rev]) => ({ day, revenue: Math.round(rev) }))
  }, [doneOrders])

  const topClients = useMemo(() => {
    const clientRevenue = {}
    doneOrders.forEach((o) => {
      const name = o.client_id || 'Без клиента'
      if (!clientRevenue[name]) clientRevenue[name] = { revenue: 0, count: 0, name: 'Без клиента' }
      clientRevenue[name].revenue += Number(o.price_final) || 0
      clientRevenue[name].count += 1
    })
    orders.forEach((o) => {
      if (o.client_id && clientRevenue[o.client_id]) {
        clientRevenue[o.client_id].name = o.client?.name || o.client_id
      }
    })
    return Object.values(clientRevenue).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
  }, [doneOrders, orders])

  const workloadData = useMemo(() => {
    const workload = {}
    orders.filter((o) => o.status === 'done' && o.assignee).forEach((o) => {
      const name = o.assignee?.display_name || 'Не назначен'
      if (!workload[name]) workload[name] = 0
      workload[name] += 1
    })
    return Object.entries(workload).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }, [orders])

  // Production widgets: общие счётчики операций + breakdown по orders/workers.
  // Используются в AnalyticsPage как кликабельные виджеты (фидбэк 17.05).
  // R15.2 (бриф 04.06 #8): добавлены R11-этапы — printed (печать всего),
  // laminated, cut, prepared (препресс), samplePrint, drying (брак),
  // selection (штучные стикеры на sticker3D после сушки).
  const productionTotals = useMemo(() => {
    // R17.5 (бриф 5.06 «Аналитика»): добавлены ops для погонных метров —
    // печать (printMeters), ламинация (lamMeters), резка (cutMeters).
    // Менеджер просил «виджеты с учётом печати, ламинации и реза, измерять
    // в погонных метрах» — параллельно с «штучными» виджетами.
    const OPS = ['poured', 'selected', 'assembled', 'packaged', 'printed', 'laminated', 'cut', 'prepared', 'samplePrint', 'drying', 'selection', 'printMeters', 'lamMeters', 'cutMeters', 'otkDefects']
    const tot = {}
    const byOp = {}
    const workersByOp = {}
    for (const op of OPS) { tot[op] = 0; byOp[op] = {}; workersByOp[op] = {} }
    const ordersByIdLocal = {}
    for (const o of orders) ordersByIdLocal[o.id] = o
    function bump(op, log, qty) {
      if (!qty) return
      tot[op] += qty
      if (log.order_id) byOp[op][log.order_id] = (byOp[op][log.order_id] || 0) + qty
      if (log.worker_id) {
        const name = log.worker?.display_name || 'Неизвестно'
        const w = workersByOp[op][log.worker_id] || { name, count: 0 }
        w.count += qty
        workersByOp[op][log.worker_id] = w
      }
    }
    for (const log of data.productionLogs) {
      if (log.stage === 'pouring' || log.stage === 'selection_pouring') {
        bump('poured', log, Number(log.stickers_good) || 0)
      }
      if (log.stage === 'selection_pouring') {
        bump('selected', log, Number(log.qty_selected) || 0)
      }
      if (log.stage === 'assembly_3d') {
        bump('assembled', log, Number(log.packs_assembled) || 0)
      }
      if (log.stage === 'packaging') {
        bump('packaged', log, Number(log.packs_packaged) || 0)
      }
      // R11/R15.2 — новые этапы
      if (log.stage === 'print') {
        const stickers = Number(log.stickers_printed) || 0
        const backgrounds = Number(log.backgrounds_printed) || 0
        bump('printed', log, stickers + backgrounds)
        // R17.5: погонные метры плёнки на печать (округление до 0.1 м для UI).
        bump('printMeters', log, Math.round((Number(log.film_meters) || 0) * 10) / 10)
      }
      if (log.stage === 'lamination') {
        bump('laminated', log, Number(log.lamination_qty) || 0)
        bump('lamMeters', log, Math.round((Number(log.lamination_meters) || 0) * 10) / 10)
      }
      if (log.stage === 'cutting') {
        bump('cut', log, Number(log.qty_cut) || 0)
        // На резке plotter тянет столько же метров плёнки сколько было на печати.
        bump('cutMeters', log, Math.round((Number(log.film_meters) || 0) * 10) / 10)
      }
      if (log.stage === 'prepress') {
        bump('prepared', log, Number(log.prepared_qty) || 0)
      }
      if (log.stage === 'sample_print') {
        // считаем сами образцы как «1» — поле sample_film_meters — это м плёнки,
        // но виджет показывает количество событий печати образца.
        bump('samplePrint', log, Number(log.sample_film_meters) > 0 ? 1 : 0)
      }
      if (log.stage === 'drying') {
        // На drying фиксируется ТОЛЬКО брак (см. STAGE_FIELDS), поэтому виджет
        // показывает «брак на сушке» — суммируем defects.
        bump('drying', log, Number(log.defects) || 0)
      }
      if (log.stage === 'selection') {
        bump('selection', log, Number(log.qty_selected) || 0)
      }
      // R25.2 (ТЗ 2.4): брак, найденный на ТК (все типы).
      if (log.stage === 'otk') {
        bump('otkDefects', log, Number(log.defects) || 0)
      }
    }
    return { totals: tot, byOrder: byOp, byWorker: workersByOp, ordersById: ordersByIdLocal }
  }, [data.productionLogs, orders])

  // Зарплата по работникам — из production_logs через WORKER_RATES
  const payrollData = useMemo(() => {
    const byWorker = {}
    for (const log of data.productionLogs) {
      if (!log.worker_id) continue
      const name = log.worker?.display_name || 'Неизвестно'
      const payout = calculateWorkerPayout([log], { ordersById, rates: data.payoutRates, shapeByDesign: data.shapeByDesign, orderShape: data.orderShape })
      if (!byWorker[name]) byWorker[name] = 0
      byWorker[name] += payout.total
    }
    return Object.entries(byWorker)
      .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
      .filter((w) => w.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [data.productionLogs, ordersById, data.payoutRates, data.shapeByDesign, data.orderShape])

  const matData = useMemo(() => {
    // 1) Из material_transactions (списания)
    const matConsumption = {}
    ;(data.materialTx || []).filter((t) => Number(t.delta) < 0).forEach((t) => {
      const name = t.material?.name || 'Неизвестно'
      const unit = t.material?.unit || ''
      if (!matConsumption[name]) matConsumption[name] = { total: 0, unit }
      matConsumption[name].total += Math.abs(Number(t.delta))
    })
    // 2) Plus из production_logs (плёнка, ламинация, смола — если транзакций нет)
    let totalFilm = 0, totalLam = 0, totalResin = 0
    for (const l of data.productionLogs) {
      totalFilm += Number(l.film_meters) || 0
      totalLam += Number(l.lamination_meters) || 0
      totalResin += Number(l.resin_grams) || 0
    }
    if (totalFilm > 0 && !matConsumption['Плёнка (логи)']) {
      matConsumption['Плёнка (по логам)'] = { total: totalFilm, unit: 'м' }
    }
    if (totalLam > 0) matConsumption['Ламинация (по логам)'] = { total: totalLam, unit: 'м' }
    if (totalResin > 0) matConsumption['Смола (по логам)'] = { total: totalResin, unit: 'г' }
    return Object.entries(matConsumption).map(([name, d]) => ({ name, ...d }))
  }, [data.materialTx, data.productionLogs])

  const throughputData = useMemo(() => {
    const now = new Date()
    const weeks = []
    for (let i = 7; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 })
      const weekEnd = startOfWeek(subWeeks(now, i - 1), { weekStartsOn: 1 })
      const weekNum = getISOWeek(weekStart)
      const count = orders.filter((o) => {
        if (o.status !== 'done') return false
        const d = new Date(o.updated_at || o.created_at)
        return d >= weekStart && d < weekEnd
      }).length
      weeks.push({ week: `Нед ${weekNum}`, count })
    }
    return weeks
  }, [orders])

  const isEmpty = !loading && orders.length === 0

  return {
    loading,
    error,
    isEmpty,
    refetch: fetchData,
    orders,
    doneOrders,
    revenue,
    totalCost,
    totalPayout,
    avgCheck,
    cancelledCount,
    conversionRate,
    revenueDelta,
    prevOrders: data.prevOrders,
    typeData,
    statusData,
    avgStageData,
    trendData,
    topClients,
    workloadData,
    payrollData,
    matData,
    throughputData,
    productionTotals,
  }
}
