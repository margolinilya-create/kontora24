import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { MS_PER_MINUTE } from '@/shared/constants'

/**
 * Hook for worker shift clock-in / clock-out.
 * Tracks daily work hours via k24_shift_entries.
 */
export function useShiftTracker() {
  const { profile } = useAuth()
  const [activeShift, setActiveShift] = useState(null)
  const [todayMinutes, setTodayMinutes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchShiftData = useCallback(async () => {
    if (!profile) return
    setError(null)
    try {
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
      if (activeRes.error) throw activeRes.error
      if (todayRes.error) throw todayRes.error

      setActiveShift(activeRes.data?.[0] || null)
      const totalMinutes = (todayRes.data || []).reduce((sum, s) => sum + (s.duration_minutes || 0), 0)
      setTodayMinutes(totalMinutes)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => { fetchShiftData() }, [fetchShiftData])
  useRefetchOnFocus(fetchShiftData)

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
    const snapshot = activeShift
    const now = new Date()
    const started = new Date(snapshot.started_at)
    const durationMinutes = Math.round((now - started) / MS_PER_MINUTE)

    // Optimistic — сразу убираем активную смену из UI
    setActiveShift(null)

    try {
      const { error } = await supabase
        .from('k24_shift_entries')
        .update({ ended_at: now.toISOString(), duration_minutes: durationMinutes })
        .eq('id', snapshot.id)
      if (error) throw error
      // Рефреш не критичен — если упал, активная смена уже null, todayMinutes
      // поправится при следующем монтировании.
      try { await fetchShiftData() } catch { /* swallow */ }
    } catch (err) {
      // Откат: возвращаем активную смену чтобы пользователь мог повторить
      setActiveShift(snapshot)
      throw err
    }
  }, [profile, activeShift, fetchShiftData])

  return {
    isOnShift: !!activeShift,
    activeShift,
    todayMinutes,
    loading,
    error,
    clockIn,
    clockOut,
  }
}
