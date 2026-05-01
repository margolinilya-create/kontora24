import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'

const ACTIVE_TIMER_KEY = 'kontora24_active_timer'

export function useTimer(orderId) {
  const { profile } = useAuth()
  const [entries, setEntries] = useState([])
  const [activeEntry, setActiveEntry] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef(null)

  // Load entries + check localStorage for active timer
  useEffect(() => {
    if (!orderId) return

    async function load() {
      const { data } = await supabase
        .from('k24_time_entries')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
      setEntries(data || [])

      // Check for active timer in localStorage
      const saved = JSON.parse(localStorage.getItem(ACTIVE_TIMER_KEY) || 'null')
      if (saved && saved.orderId === orderId && saved.entryId) {
        const { data: entry } = await supabase
          .from('k24_time_entries')
          .select('*')
          .eq('id', saved.entryId)
          .single()
        if (entry && !entry.ended_at) {
          setActiveEntry(entry)
        } else {
          localStorage.removeItem(ACTIVE_TIMER_KEY)
        }
      }
    }
    load()
  }, [orderId])

  // Tick every second when timer is active
  useEffect(() => {
    if (activeEntry) {
      const tick = () => {
        const seconds = Math.floor((Date.now() - new Date(activeEntry.started_at).getTime()) / 1000)
        setElapsed(seconds)
      }
      tick()
      intervalRef.current = setInterval(tick, 1000)
      return () => clearInterval(intervalRef.current)
    } else {
      setElapsed(0)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [activeEntry])

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
    const durationMinutes = Math.round((endedAt - new Date(activeEntry.started_at)) / 60000)

    const { error } = await supabase
      .from('k24_time_entries')
      .update({ ended_at: endedAt.toISOString(), duration_minutes: durationMinutes })
      .eq('id', activeEntry.id)
    if (error) throw error

    setActiveEntry(null)
    localStorage.removeItem(ACTIVE_TIMER_KEY)

    // Refresh entries
    const { data } = await supabase
      .from('k24_time_entries')
      .select('*')
      .eq('order_id', activeEntry.order_id)
      .order('created_at', { ascending: false })
    setEntries(data || [])
  }, [activeEntry])

  const totalMinutes = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0)

  return {
    isRunning: !!activeEntry,
    elapsed, // seconds
    totalMinutes,
    entries,
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
