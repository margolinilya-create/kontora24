import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { computeStageProgress } from '../lib/production-logs'

/**
 * Hook for managing production logs for a specific order.
 * Fetches all logs, computes stage progress, provides addLog().
 */
export function useProductionLogs(orderId, targetQty) {
  const { profile } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchLogs = useCallback(async () => {
    if (!orderId) return
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('k24_production_logs')
        .select('*, worker:k24_profiles!worker_id(display_name, role)')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
      if (err) throw err
      setLogs(data || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Realtime updates — stable subscription via ref (no re-subscribe on fetchLogs change)
  const fetchRef = useRef(fetchLogs)
  useEffect(() => { fetchRef.current = fetchLogs }, [fetchLogs])

  useEffect(() => {
    if (!orderId) return
    const channel = supabase
      .channel(`prod-logs-${orderId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'k24_production_logs',
        filter: `order_id=eq.${orderId}`,
      }, () => fetchRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orderId])

  const addLog = useCallback(async (stage, data) => {
    if (!profile) throw new Error('Не авторизован')
    const { error } = await supabase.from('k24_production_logs').insert({
      order_id: orderId,
      stage,
      worker_id: profile.id,
      ...data,
    })
    if (error) throw error
    await fetchLogs()
  }, [orderId, profile, fetchLogs])

  function getStageProgress(stage) {
    return computeStageProgress(logs, stage, targetQty || 0)
  }

  function isStageComplete(stage) {
    return getStageProgress(stage).isComplete
  }

  return { logs, loading, error, addLog, getStageProgress, isStageComplete, refetch: fetchLogs }
}
