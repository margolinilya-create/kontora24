import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'

/**
 * Hook for worker shift clock-in / clock-out.
 * Tracks daily work hours via k24_shift_entries.
 */
export function useShiftTracker() {
  const { profile } = useAuth()
  const [activeShift, setActiveShift] = useState(null)
  const [todayMinutes, setTodayMinutes] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchShiftData = useCallback(async () => {
    if (!profile) return
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [activeRes, todayRes] = await Promise.all([
      // Active shift (started but not ended)
      supabase
        .from('k24_shift_entries')
        .select('*')
        .eq('worker_id', profile.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1),
      // Today's completed shifts
      supabase
        .from('k24_shift_entries')
        .select('duration_minutes')
        .eq('worker_id', profile.id)
        .not('ended_at', 'is', null)
        .gte('started_at', today.toISOString()),
    ])

    setActiveShift(activeRes.data?.[0] || null)
    const totalMinutes = (todayRes.data || []).reduce((sum, s) => sum + (s.duration_minutes || 0), 0)
    setTodayMinutes(totalMinutes)
    setLoading(false)
  }, [profile])

  useEffect(() => { fetchShiftData() }, [fetchShiftData])

  const clockIn = useCallback(async () => {
    if (!profile || activeShift) return
    const { error } = await supabase.from('k24_shift_entries').insert({
      worker_id: profile.id,
    })
    if (error) throw error
    await fetchShiftData()
  }, [profile, activeShift, fetchShiftData])

  const clockOut = useCallback(async () => {
    if (!profile || !activeShift) return
    const now = new Date()
    const started = new Date(activeShift.started_at)
    const durationMinutes = Math.round((now - started) / 60000)

    const { error } = await supabase
      .from('k24_shift_entries')
      .update({ ended_at: now.toISOString(), duration_minutes: durationMinutes })
      .eq('id', activeShift.id)
    if (error) throw error
    await fetchShiftData()
  }, [profile, activeShift, fetchShiftData])

  return {
    isOnShift: !!activeShift,
    activeShift,
    todayMinutes,
    loading,
    clockIn,
    clockOut,
  }
}
