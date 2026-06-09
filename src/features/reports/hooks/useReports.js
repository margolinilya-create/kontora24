import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { captureError } from '@/shared/lib/sentry'
import { subDays, startOfMonth, startOfDay, endOfDay, format, parseISO } from 'date-fns'

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
      const [ordersRes, logsRes] = await Promise.all([
        supabase.from('k24_orders')
          .select(`id, number, custom_number, order_type, qty, price_final,
                   cost_materials, cost_labor, cost_total, status,
                   created_at, deadline, width_mm, height_mm,
                   film_type, film_type_stickers, lam_type, need_lam,
                   stickers_per_pack, notes, delivery_type, payment_status,
                   client:k24_clients!client_id(name)`)
          .gte('created_at', getSince(period)).lte('created_at', getUntil(period) ?? '9999-12-31T23:59:59Z')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('k24_production_logs')
          .select(`order_id, film_meters, resin_grams, lamination_meters,
                   film_type, track, stickers_printed, stickers_poured,
                   stickers_good, packs_assembled, packs_packaged, qty_selected,
                   boxes_used,
                   order:k24_orders!order_id(lam_type, film_type, film_type_stickers, order_type)`)
          .gte('created_at', getSince(period)).lte('created_at', getUntil(period) ?? '9999-12-31T23:59:59Z')
          .limit(10000),
      ])
      if (ordersRes.error) throw ordersRes.error
      if (logsRes.error) throw logsRes.error

      const logsByOrder = {}
      ;(logsRes.data || []).forEach((l) => {
        if (!logsByOrder[l.order_id]) {
          logsByOrder[l.order_id] = {
            film: 0, resin: 0, lam: 0,
            filmByType: {}, lamByType: {},
            stickers_printed: 0, stickers_poured: 0, stickers_good: 0,
            packs_assembled: 0, packs_packaged: 0, qty_selected: 0,
            boxes_used: 0,
            payouts: 0,
          }
        }
        const acc = logsByOrder[l.order_id]
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
        const lg = logsByOrder[o.id] || { film: 0, resin: 0, lam: 0, stickers_printed: 0, stickers_poured: 0, stickers_good: 0, packs_assembled: 0, packs_packaged: 0, qty_selected: 0, boxes_used: 0, filmByType: {}, lamByType: {} }
        const rejected = lg.stickers_poured > 0 ? lg.stickers_poured - lg.stickers_good : 0
        const rejectPct = lg.stickers_poured > 0 ? Math.round((rejected / lg.stickers_poured) * 100) : 0
        const surplus = lg.stickers_printed > 0 && o.qty > 0 ? lg.stickers_printed - o.qty : 0
        const surplusPct = o.qty > 0 ? Math.round((surplus / o.qty) * 100) : 0
        return {
          ...o,
          client_name: o.client?.name || null,
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
          rejected, reject_pct: rejectPct, surplus, surplus_pct: surplusPct,
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
          .select('worker_id, stage, order_id, stickers_good, packs_assembled, packs_packaged, qty_selected, worker:k24_profiles!worker_id(display_name), order:k24_orders!order_id(stickers_per_pack)')
          .gte('created_at', getSince(period)).lte('created_at', getUntil(period) ?? '9999-12-31T23:59:59Z').limit(10000),
        supabase.from('k24_settings').select('value').eq('key', 'bonus_rates').single(),
      ])
      if (logsRes.error) throw logsRes.error
      // ratesRes.error может быть PGRST116 (no rows) — это норм, используем default rates
      if (ratesRes.error && ratesRes.error.code !== 'PGRST116') throw ratesRes.error

      const rates = ratesRes.data?.value || {
        pouring: 1, assembly_3d: 0.5, packaging: 1.5, selection: 0.5,
      }

      const byWorker = {}
      ;(logsRes.data || []).forEach((l) => {
        const name = l.worker?.display_name || 'Неизвестный'
        if (!byWorker[name]) byWorker[name] = { name, resin: 0, assembly: 0, packaging: 0, selection: 0, total: 0 }

        if (l.stickers_good) { byWorker[name].resin += l.stickers_good; byWorker[name].total += l.stickers_good * (rates.pouring || 0) }
        if (l.packs_assembled) {
          // Сборка 3D: packs × stickers_per_pack × ставка (фидбэк 12.05)
          const perPack = Number(l.order?.stickers_per_pack) || 1
          byWorker[name].assembly += l.packs_assembled
          byWorker[name].total += l.packs_assembled * perPack * (rates.assembly_3d || 0)
        }
        if (l.packs_packaged) { byWorker[name].packaging += l.packs_packaged; byWorker[name].total += l.packs_packaged * (rates.packaging || 0) }
        if (l.qty_selected) {
          // Выборка фонов (selection_pouring) — каждый фон = N стикеров (×stickers_per_pack).
          // Выборка штучных (R11 stage='selection' для sticker3D) — qty_selected уже = шт.
          const perPack = l.stage === 'selection_pouring'
            ? (Number(l.order?.stickers_per_pack) || 1)
            : 1
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
          .select('worker_id, stage, order_id, stickers_good, packs_assembled, packs_packaged, qty_selected, stickers_printed, lamination_qty, qty_cut, worker:k24_profiles!worker_id(display_name), order:k24_orders!order_id(stickers_per_pack)')
          .gte('created_at', getSince(period)).lte('created_at', getUntil(period) ?? '9999-12-31T23:59:59Z')
          .limit(10000),
        supabase.from('k24_settings').select('value').eq('key', 'bonus_rates').single(),
      ])
      if (shiftsRes.error) throw shiftsRes.error
      if (logsRes.error) throw logsRes.error
      if (ratesRes.error && ratesRes.error.code !== 'PGRST116') throw ratesRes.error

      const rates = ratesRes.data?.value || { pouring: 1, assembly_3d: 0.5, packaging: 1.5, selection: 0.5 }
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

      ;(shiftsRes.data || []).forEach((s) => {
        const w = ensure(s.worker_id, s.worker?.display_name || 'Неизвестный')
        w.totalMinutes += s.duration_minutes || 0
        const day = format(new Date(s.started_at), 'dd.MM.yy')
        w.days[day] = (w.days[day] || 0) + (s.duration_minutes || 0)
      })

      ;(logsRes.data || []).forEach((l) => {
        if (!l.worker_id) return
        const w = ensure(l.worker_id, l.worker?.display_name || 'Неизвестный')
        const perPack = Number(l.order?.stickers_per_pack) || 1
        // R14.6 hotfix: selection (штучные R11) множитель =1, selection_pouring (фоны) =perPack.
        const selectionMult = l.stage === 'selection_pouring' ? perPack : 1
        if (l.stickers_good) { w.poured += l.stickers_good; w.payout += l.stickers_good * (rates.pouring || 0) }
        if (l.qty_selected) { w.selected += l.qty_selected; w.payout += l.qty_selected * selectionMult * (rates.selection || 0) }
        if (l.packs_assembled) { w.assembled += l.packs_assembled; w.payout += l.packs_assembled * perPack * (rates.assembly_3d || 0) }
        if (l.packs_packaged) { w.packaged += l.packs_packaged; w.payout += l.packs_packaged * (rates.packaging || 0) }
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
