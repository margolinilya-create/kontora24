import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { subDays, startOfMonth, format } from 'date-fns'

function getSince(period) {
  if (period === 'month') return startOfMonth(new Date()).toISOString()
  return subDays(new Date(), parseInt(period) || 30).toISOString()
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
        .gte('started_at', getSince(period))
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
      const [ordersRes, logsRes] = await Promise.all([
        supabase.from('k24_orders').select('id, number, order_type, qty, price_final, cost_total, status, created_at')
          .gte('created_at', getSince(period)).order('created_at', { ascending: false }).limit(500),
        supabase.from('k24_production_logs').select('order_id, film_meters, resin_grams')
          .gte('created_at', getSince(period)).limit(5000),
      ])
      if (ordersRes.error) throw ordersRes.error
      if (logsRes.error) throw logsRes.error

      const logsByOrder = {}
      ;(logsRes.data || []).forEach((l) => {
        if (!logsByOrder[l.order_id]) logsByOrder[l.order_id] = { film: 0, resin: 0 }
        logsByOrder[l.order_id].film += Number(l.film_meters) || 0
        logsByOrder[l.order_id].resin += Number(l.resin_grams) || 0
      })

      const rows = (ordersRes.data || []).map((o) => ({
        ...o,
        actual_film: logsByOrder[o.id]?.film || 0,
        actual_resin: logsByOrder[o.id]?.resin || 0,
        profit: (Number(o.price_final) || 0) - (Number(o.cost_total) || 0),
        margin_pct: o.price_final > 0 ? Math.round(((o.price_final - o.cost_total) / o.price_final) * 100) : 0,
      }))
      setData(rows)
    } catch (err) {
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
          .gte('created_at', getSince(period)).limit(10000),
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
        if (l.qty_selected) { byWorker[name].selection += l.qty_selected; byWorker[name].total += l.qty_selected * (rates.selection || 0) }
      })

      setData(Object.values(byWorker).sort((a, b) => b.total - a.total))
    } catch (err) {
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
        supabase.from('k24_orders').select('id, number, qty, order_type')
          .gte('created_at', getSince(period)).order('number').limit(500),
        supabase.from('k24_production_logs')
          .select('order_id, stickers_printed, stickers_poured, stickers_good')
          .gte('created_at', getSince(period)).limit(10000),
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
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])
  useRefetchOnFocus(fetchData)

  return { data, loading, error, refetch: fetchData }
}
