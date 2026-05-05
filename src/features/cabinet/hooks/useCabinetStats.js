import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { subDays, startOfMonth } from 'date-fns'

/**
 * Fetches personal stats for worker cabinet:
 * - Production logs aggregated by action type and period
 * - Shift entries for work hours
 */
export function useCabinetStats(period = '30d') {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ byAction: [], byOrder: [], totalItems: 0, totalHours: 0 })
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

      const [logsRes, shiftsRes] = await Promise.all([
        supabase
          .from('k24_production_logs')
          .select('*, order:k24_orders!order_id(number, order_type, qty)')
          .eq('worker_id', profile.id)
          .gte('created_at', since)
          .order('created_at', { ascending: false }),
        supabase
          .from('k24_shift_entries')
          .select('*')
          .eq('worker_id', profile.id)
          .gte('started_at', since)
          .not('ended_at', 'is', null)
          .order('started_at', { ascending: false }),
      ])
      if (logsRes.error) throw logsRes.error
      if (shiftsRes.error) throw shiftsRes.error

      const logs = logsRes.data || []
      const shifts = shiftsRes.data || []

      // Aggregate by action type
      const actionMap = {}
      logs.forEach((l) => {
        if (!actionMap[l.stage]) actionMap[l.stage] = { stage: l.stage, count: 0, entries: 0 }
        actionMap[l.stage].entries += 1
        // Sum main quantity field
        if (l.stickers_printed) actionMap[l.stage].count += l.stickers_printed
        if (l.stickers_good) actionMap[l.stage].count += l.stickers_good
        if (l.packs_assembled) actionMap[l.stage].count += l.packs_assembled
        if (l.packs_packaged) actionMap[l.stage].count += l.packs_packaged
        if (l.packs_selected) actionMap[l.stage].count += l.packs_selected
      })

      // Aggregate by order
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

      const totalHours = shifts.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / 60

      setStats({
        byAction: Object.values(actionMap),
        byOrder: Object.values(orderMap).sort((a, b) => b.totalEntries - a.totalEntries),
        totalItems: logs.length,
        totalHours: Math.round(totalHours * 10) / 10,
        shifts,
        logs,
      })
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [profile, period])

  useEffect(() => { fetchStats() }, [fetchStats])

  return { stats, loading, error, refetch: fetchStats }
}
