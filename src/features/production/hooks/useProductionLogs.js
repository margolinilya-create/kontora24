import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { computeStageProgress } from '../lib/production-logs'

/**
 * Hook for managing production logs for a specific order.
 * Fetches active logs (deleted_at IS NULL), computes stage progress,
 * provides addLog/updateLog/softDeleteLog.
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
        .is('deleted_at', null)
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
  useRefetchOnFocus(fetchLogs)

  // Realtime updates — stable subscription via ref (no re-subscribe on fetchLogs change)
  const fetchRef = useRef(fetchLogs)
  useEffect(() => { fetchRef.current = fetchLogs }, [fetchLogs])

  useEffect(() => {
    if (!orderId) return
    // Уникальный channel name на монтирование — на странице очереди может быть
    // несколько QueueCard для одного заказа (3D-pack подзадачи Фон+Стикер),
    // и Supabase Realtime крашит .on() если канал уже подписан под тем же name.
    const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
    const channel = supabase
      .channel(`prod-logs-${orderId}-${uid}`)
      .on('postgres_changes', {
        event: '*',
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

  const updateLog = useCallback(async (logId, patch) => {
    const { error } = await supabase
      .from('k24_production_logs')
      .update(patch)
      .eq('id', logId)
    if (error) throw error
    await fetchLogs()
  }, [fetchLogs])

  const softDeleteLog = useCallback(async (logId) => {
    const { error } = await supabase
      .from('k24_production_logs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', logId)
    if (error) throw error
    await fetchLogs()
  }, [fetchLogs])

  function getStageProgress(stage, track) {
    return computeStageProgress(logs, stage, targetQty || 0, track)
  }

  function isStageComplete(stage, track) {
    return getStageProgress(stage, track).isComplete
  }

  return { logs, loading, error, addLog, updateLog, softDeleteLog, getStageProgress, isStageComplete, refetch: fetchLogs }
}

/**
 * Page-level batch hook: загружает production_logs для МНОЖЕСТВА заказов
 * одним SELECT'ом и держит одну Realtime-подписку на всю страницу.
 *
 * Используется в QueuePage / OrdersKanban где раньше каждая QueueCard
 * монтировала свой useProductionLogs → 15 карточек = 15 WS-каналов + 15 SELECT.
 * Аудит 18.05: на mobile/MTS заметные тормоза и расход Realtime-квот.
 *
 * Возвращает getStageProgress(orderId, stage, targetQty, track) — то же что
 * useProductionLogs, но по индексу orderId.
 */
export function useBatchProductionLogs(orderIds) {
  const orderIdsKey = (orderIds || []).join(',')
  const [logsByOrder, setLogsByOrder] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchLogs = useCallback(async () => {
    if (!orderIds || orderIds.length === 0) {
      setLogsByOrder({})
      setLoading(false)
      return
    }
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('k24_production_logs')
        .select('*, worker:k24_profiles!worker_id(display_name, role)')
        .in('order_id', orderIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (err) throw err
      const grouped = {}
      for (const log of data || []) {
        if (!grouped[log.order_id]) grouped[log.order_id] = []
        grouped[log.order_id].push(log)
      }
      setLogsByOrder(grouped)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- orderIdsKey is the serialized form of orderIds
  }, [orderIdsKey])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useRefetchOnFocus(fetchLogs)

  const fetchRef = useRef(fetchLogs)
  useEffect(() => { fetchRef.current = fetchLogs }, [fetchLogs])

  useEffect(() => {
    if (!orderIdsKey) return
    const orderSet = new Set(orderIdsKey.split(','))
    // uuid-suffix для безопасной де-дупликации каналов между HMR/двойным mount.
    const uid = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))
    const channel = supabase
      .channel(`batch-prod-logs-${uid}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'k24_production_logs',
      }, (payload) => {
        const id = payload.new?.order_id || payload.old?.order_id
        if (id && orderSet.has(id)) fetchRef.current()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orderIdsKey])

  function getStageProgress(orderId, stage, targetQty, track) {
    return computeStageProgress(logsByOrder[orderId] || [], stage, targetQty || 0, track)
  }

  return { logsByOrder, loading, error, getStageProgress, refetch: fetchLogs }
}
