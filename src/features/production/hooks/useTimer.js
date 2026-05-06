import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { captureError } from '@/shared/lib/sentry'
import { MS_PER_MINUTE } from '@/shared/constants'

const ACTIVE_TIMER_KEY_PREFIX = 'kontora24_active_timer'

function getTimerKey(userId) {
  return userId ? `${ACTIVE_TIMER_KEY_PREFIX}_${userId}` : ACTIVE_TIMER_KEY_PREFIX
}

export function useTimer(orderId, { tickInterval = 1000 } = {}) {
  const { profile } = useAuth()
  const ACTIVE_TIMER_KEY = getTimerKey(profile?.id)
  const [entries, setEntries] = useState([])
  const [activeEntry, setActiveEntry] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  // Load entries + check localStorage for active timer
  useEffect(() => {
    if (!orderId) return

    async function load() {
      // 1. loadEntries — history of entries for this order
      try {
        const { data, error: err } = await supabase
          .from('k24_time_entries')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false })
        if (err) throw err
        setEntries(data || [])
      } catch (err) {
        setError(err)
        captureError(err, { tags: { source: 'useTimer.loadEntries' }, extra: { orderId } })
      }

      // 2. checkRunning — verify that localStorage-saved active timer still exists in DB
      const saved = JSON.parse(localStorage.getItem(ACTIVE_TIMER_KEY) || 'null')
      if (saved && saved.orderId === orderId && saved.entryId) {
        try {
          const { data: entry, error: err } = await supabase
            .from('k24_time_entries')
            .select('*')
            .eq('id', saved.entryId)
            .single()
          // PGRST116 (no rows) = entry was deleted; valid case, clear localStorage
          if (err && err.code !== 'PGRST116') throw err
          if (entry && !entry.ended_at) {
            setActiveEntry(entry)
          } else {
            localStorage.removeItem(ACTIVE_TIMER_KEY)
          }
        } catch (err) {
          setError(err)
          captureError(err, { tags: { source: 'useTimer.checkRunning' }, extra: { entryId: saved.entryId, orderId } })
          // Do NOT reset activeEntry or clear localStorage on error.
          // If we lost connectivity but a timer was running, keep showing it as
          // running so the user can stop it; clearing here would risk a duplicate
          // timer being started over an existing one and inflating billable hours.
        }
      }
    }
    load()
  }, [orderId])

  // Tick at configured interval when timer is active
  useEffect(() => {
    if (activeEntry) {
      const tick = () => {
        const seconds = Math.floor((Date.now() - new Date(activeEntry.started_at).getTime()) / 1000)
        setElapsed(seconds)
      }
      tick()
      intervalRef.current = setInterval(tick, tickInterval)
      return () => clearInterval(intervalRef.current)
    } else {
      setElapsed(0)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [activeEntry, tickInterval])

  const start = useCallback(async (status) => {
    if (!profile || !orderId) return
    const { data, error } = await supabase
      .from('k24_time_entries')
      .insert({
        order_id: orderId,
        user_id: profile.id,
        started_at: new Date().toISOString(),
        status: status || 'work',
      })
      .select()
      .single()
    if (error) throw error
    setActiveEntry(data)
    localStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify({ orderId, entryId: data.id }))
    return data
  }, [orderId, profile])

  const stop = useCallback(async () => {
    if (!activeEntry) return
    const endedAt = new Date()
    const durationMinutes = Math.round((endedAt - new Date(activeEntry.started_at)) / MS_PER_MINUTE)

    const { error } = await supabase
      .from('k24_time_entries')
      .update({ ended_at: endedAt.toISOString(), duration_minutes: durationMinutes })
      .eq('id', activeEntry.id)
    if (error) throw error

    setActiveEntry(null)
    localStorage.removeItem(ACTIVE_TIMER_KEY)

    // Refresh entries
    try {
      const { data, error: refreshErr } = await supabase
        .from('k24_time_entries')
        .select('*')
        .eq('order_id', activeEntry.order_id)
        .order('created_at', { ascending: false })
      if (refreshErr) throw refreshErr
      setEntries(data || [])
    } catch (err) {
      setError(err)
      captureError(err, { tags: { source: 'useTimer.refresh' }, extra: { orderId: activeEntry.order_id } })
    }
  }, [activeEntry])

  const totalMinutes = useMemo(() => entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0), [entries])

  return {
    isRunning: !!activeEntry,
    elapsed, // seconds
    totalMinutes,
    entries,
    error,
    start,
    stop,
  }
}

// Format seconds as HH:MM:SS
export function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// Format total minutes as "Xч Yмин"
export function formatTotalTime(minutes) {
  if (!minutes) return '0 мин'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h} ч ${m} мин`
  return `${m} мин`
}
