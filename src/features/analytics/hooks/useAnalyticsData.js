import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import {
  ORDER_TYPES, ORDER_STATUSES,
  calculateActualMaterialsCost, calculateWorkerPayout,
} from '@/shared/constants'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { subDays, subMonths, subWeeks, startOfWeek, format, differenceInHours, getISOWeek } from 'date-fns'

export const PERIODS = [
  { key: '7d', label: '7 дней', getStart: () => subDays(new Date(), 7) },
  { key: '30d', label: '30 дней', getStart: () => subDays(new Date(), 30) },
  { key: '90d', label: '3 месяца', getStart: () => subMonths(new Date(), 3) },
  { key: 'all', label: 'Всё время', getStart: () => new Date('2020-01-01') },
]

export function useAnalyticsData(period) {
  const [data, setData] = useState({
    orders: [], statusHistory: [], materialTx: [], prevOrders: [], productionLogs: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const periodDef = PERIODS.find((p) => p.key === period) || PERIODS[1]
      const startDate = periodDef.getStart()
      const periodMs = Date.now() - startDate.getTime()
      const prevStart = new Date(startDate.getTime() - periodMs)

      const [ordersRes, historyRes, matTxRes, prevOrdersRes, logsRes] = await Promise.all([
        supabase.from('k24_orders').select('id, number, status, order_type, qty, price_final, cost_total, cost_labor, cost_materials, film_type, film_type_stickers, deadline, created_at, updated_at, client:k24_clients(name), client_id, assignee:k24_profiles!assigned_to(display_name)').gte('created_at', startDate.toISOString()).limit(1000),
        supabase.from('k24_order_status_history').select('id, order_id, from_status, to_status, created_at').gte('created_at', startDate.toISOString()).limit(5000),
        supabase.from('k24_material_transactions').select('id, material_id, delta, reason, created_at, material:k24_materials(name, type, unit)').gte('created_at', startDate.toISOString()).limit(5000),
        period !== 'all' ? supabase.from('k24_orders').select('id, status, price_final').gte('created_at', prevStart.toISOString()).lt('created_at', startDate.toISOString()).limit(1000) : Promise.resolve({ data: [], error: null }),
        supabase.from('k24_production_logs').select('id, order_id, stage, track, worker_id, stickers_printed, backgrounds_printed, stickers_good, stickers_poured, qty_selected, qty_cut, packs_assembled, packs_packaged, film_meters, film_type, lamination_meters, lamination_qty, resin_grams, defects, worker:k24_profiles!worker_id(display_name)').is('deleted_at', null).gte('created_at', startDate.toISOString()).limit(10000),
      ])
      if (ordersRes.error) throw ordersRes.error
      if (historyRes.error) throw historyRes.error
      if (matTxRes.error) throw matTxRes.error
      if (prevOrdersRes.error) throw prevOrdersRes.error
      if (logsRes.error) throw logsRes.error

      setData({
        orders: ordersRes.data || [],
        statusHistory: historyRes.data || [],
        materialTx: matTxRes.data || [],
        prevOrders: prevOrdersRes.data || [],
        productionLogs: logsRes.data || [],
      })
    } catch (err) {
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

  // Заказы с расчётной себестоимостью (приоритет: фактическая, fallback — ручная)
  const ordersEnriched = useMemo(() => orders.map((o) => {
    const logs = logsByOrder[o.id] || []
    const materials = calculateActualMaterialsCost(logs, o.film_type)
    const payout = calculateWorkerPayout(logs, { ordersById })
    const computedCost = materials.total + payout.total
    const fallbackCost = Number(o.cost_total) || (Number(o.cost_materials) || 0) + (Number(o.cost_labor) || 0)
    return {
      ...o,
      _computedCost: computedCost > 0 ? computedCost : fallbackCost,
      _payout: payout.total,
    }
  }), [orders, logsByOrder, ordersById])

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
      name: ORDER_TYPES[type]?.label || type, ...d, margin: d.revenue - d.cost,
    }))
  }, [doneOrders])

  const statusData = useMemo(() => {
    const byStatus = {}
    orders.forEach((o) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1 })
    return Object.entries(byStatus).map(([s, v]) => ({ name: ORDER_STATUSES[s]?.label || s, value: v }))
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
      name: ORDER_STATUSES[stage]?.label || stage,
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

  // Production widgets: общие счётчики 4 операций + breakdown по orders/workers.
  // Используются в AnalyticsPage как кликабельные виджеты (фидбэк 17.05).
  const productionTotals = useMemo(() => {
    const tot = { poured: 0, selected: 0, assembled: 0, packaged: 0 }
    const byOp = { poured: {}, selected: {}, assembled: {}, packaged: {} }      // { op: { order_id: count } }
    const workersByOp = { poured: {}, selected: {}, assembled: {}, packaged: {} } // { op: { worker_id: { name, count } } }
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
    }
    return { totals: tot, byOrder: byOp, byWorker: workersByOp, ordersById: ordersByIdLocal }
  }, [data.productionLogs, orders])

  // Зарплата по работникам — из production_logs через WORKER_RATES
  const payrollData = useMemo(() => {
    const byWorker = {}
    for (const log of data.productionLogs) {
      if (!log.worker_id) continue
      const name = log.worker?.display_name || 'Неизвестно'
      const payout = calculateWorkerPayout([log], { ordersById })
      if (!byWorker[name]) byWorker[name] = 0
      byWorker[name] += payout.total
    }
    return Object.entries(byWorker)
      .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
      .filter((w) => w.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [data.productionLogs])

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
