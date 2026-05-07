import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { subDays, startOfMonth, subMonths, format } from 'date-fns'
import { ru } from 'date-fns/locale'

/**
 * Personal stats for worker cabinet:
 * - Production logs aggregated by action type / order / month
 * - Shift entries for work hours
 * - Headline counters: poured / selected / packaged за период
 */
export function useCabinetStats(period = '30') {
  const { profile } = useAuth()
  const [stats, setStats] = useState({
    byAction: [], byOrder: [], totalItems: 0, totalHours: 0,
    headline: { poured: 0, selected: 0, packaged: 0, printed: 0, defects: 0 },
    byMonth: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchStats = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    setError(null)
    try {
      const since = period === 'month'
        ? startOfMonth(new Date()).toISOString()
        : subDays(new Date(), parseInt(period) || 30).toISOString()
      // Для графика берём 6 месяцев независимо от выбранного периода
      const sixMonthsAgo = startOfMonth(subMonths(new Date(), 5)).toISOString()

      const [logsRes, shiftsRes, monthlyRes] = await Promise.all([
        supabase
          .from('k24_production_logs')
          .select('*, order:k24_orders!order_id(number, order_type, qty)')
          .eq('worker_id', profile.id)
          .is('deleted_at', null)
          .gte('created_at', since)
          .order('created_at', { ascending: false }),
        supabase
          .from('k24_shift_entries')
          .select('*')
          .eq('worker_id', profile.id)
          .gte('started_at', since)
          .not('ended_at', 'is', null)
          .order('started_at', { ascending: false }),
        supabase
          .from('k24_production_logs')
          .select('stage, stickers_printed, stickers_good, qty_cut, qty_selected, packs_packaged, packs_assembled, defects, created_at')
          .eq('worker_id', profile.id)
          .is('deleted_at', null)
          .gte('created_at', sixMonthsAgo),
      ])
      if (logsRes.error) throw logsRes.error
      if (shiftsRes.error) throw shiftsRes.error
      if (monthlyRes.error) throw monthlyRes.error

      const logs = logsRes.data || []
      const shifts = shiftsRes.data || []
      const monthly = monthlyRes.data || []

      // Aggregate by action type (за выбранный период)
      const actionMap = {}
      logs.forEach((l) => {
        if (!actionMap[l.stage]) actionMap[l.stage] = { stage: l.stage, count: 0, entries: 0 }
        actionMap[l.stage].entries += 1
        if (l.stickers_printed) actionMap[l.stage].count += l.stickers_printed
        if (l.stickers_good) actionMap[l.stage].count += l.stickers_good
        if (l.qty_cut) actionMap[l.stage].count += l.qty_cut
        if (l.qty_selected) actionMap[l.stage].count += l.qty_selected
        if (l.packs_assembled) actionMap[l.stage].count += l.packs_assembled
        if (l.packs_packaged) actionMap[l.stage].count += l.packs_packaged
      })

      // Headline counters (за выбранный период)
      const headline = { poured: 0, selected: 0, packaged: 0, printed: 0, defects: 0 }
      logs.forEach((l) => {
        if (l.stage === 'pouring' || l.stage === 'selection_pouring') {
          headline.poured += Number(l.stickers_good) || 0
        }
        if (l.stage === 'selection_pouring') {
          headline.selected += Number(l.qty_selected) || 0
        }
        if (l.stage === 'packaging') {
          headline.packaged += Number(l.packs_packaged) || 0
        }
        if (l.stage === 'print') {
          headline.printed += Number(l.stickers_printed) || 0
        }
        headline.defects += Number(l.defects) || 0
      })

      // Aggregate by order (за выбранный период)
      const orderMap = {}
      logs.forEach((l) => {
        const key = l.order_id
        if (!orderMap[key]) {
          orderMap[key] = {
            orderId: l.order_id,
            orderNumber: l.order?.number,
            orderType: l.order?.order_type,
            stages: {},
            totalEntries: 0,
          }
        }
        if (!orderMap[key].stages[l.stage]) orderMap[key].stages[l.stage] = 0
        orderMap[key].stages[l.stage] += 1
        orderMap[key].totalEntries += 1
      })

      // By month — для графика (6 месяцев)
      const monthBuckets = new Map()
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(new Date(), i)
        const key = format(d, 'yyyy-MM')
        monthBuckets.set(key, { key, label: format(d, 'LLL', { locale: ru }), produced: 0, defects: 0 })
      }
      monthly.forEach((l) => {
        const key = format(new Date(l.created_at), 'yyyy-MM')
        const b = monthBuckets.get(key)
        if (!b) return
        const produced = (Number(l.stickers_good) || 0) + (Number(l.packs_packaged) || 0) + (Number(l.qty_cut) || 0) + (Number(l.qty_selected) || 0) + (Number(l.packs_assembled) || 0)
        b.produced += produced
        b.defects += Number(l.defects) || 0
      })

      const totalHours = shifts.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / 60

      setStats({
        byAction: Object.values(actionMap),
        byOrder: Object.values(orderMap).sort((a, b) => b.totalEntries - a.totalEntries),
        totalItems: logs.length,
        totalHours: Math.round(totalHours * 10) / 10,
        shifts,
        logs,
        headline,
        byMonth: Array.from(monthBuckets.values()),
      })
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [profile, period])

  useEffect(() => { fetchStats() }, [fetchStats])
  useRefetchOnFocus(fetchStats)

  return { stats, loading, error, refetch: fetchStats }
}
