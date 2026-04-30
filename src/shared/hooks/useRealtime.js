import { useEffect } from 'react'
import { supabase } from '@/shared/lib/supabase'

/**
 * Subscribe to Supabase Realtime changes on a table.
 * @param {string} table - Table name to watch
 * @param {Function} onEvent - Callback: (payload) => void
 * @param {Object} [options] - { event: '*'|'INSERT'|'UPDATE'|'DELETE', filter: 'column=eq.value' }
 */
export function useRealtime(table, onEvent, options = {}) {
  useEffect(() => {
    const { event = '*', filter } = options

    const channelConfig = {
      event,
      schema: 'public',
      table,
    }
    if (filter) channelConfig.filter = filter

    const channel = supabase
      .channel(`realtime-${table}-${filter || 'all'}`)
      .on('postgres_changes', channelConfig, (payload) => {
        onEvent(payload)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, onEvent, options.event, options.filter])
}
