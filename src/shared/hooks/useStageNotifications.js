import { useEffect, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { ORDER_STATUSES, NOTIFY_ROLES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { playNotificationSound } from '@/shared/lib/sound'

export function useStageNotifications() {
  const { profile } = useAuth()
  const processedRef = useRef(new Set())

  useEffect(() => {
    if (!profile) return

    const channel = supabase
      .channel('stage-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'k24_order_status_history',
      }, (payload) => {
        const { to_status, changed_by } = payload.new

        // Don't notify yourself
        if (changed_by === profile.id) return

        // Don't process the same event twice
        if (processedRef.current.has(payload.new.id)) return
        if (processedRef.current.size > 1000) processedRef.current.clear()
        processedRef.current.add(payload.new.id)

        // Check if my role should be notified for this status
        const rolesToNotify = NOTIFY_ROLES[to_status] || []
        if (!rolesToNotify.includes(profile.role)) return

        // Play sound and show toast
        playNotificationSound()
        const statusLabel = ORDER_STATUSES[to_status]?.label || to_status
        toast.info(`Новый заказ в очереди: ${statusLabel}`)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile])
}
