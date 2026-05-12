import { useEffect, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import { captureError } from '@/shared/lib/sentry'
import { formatOrderNumber } from '@/shared/lib/utils'

export function useDeadlineAlerts() {
  const hasChecked = useRef(false)

  useEffect(() => {
    if (hasChecked.current) return
    hasChecked.current = true

    async function checkDeadlines() {
      try {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(23, 59, 59, 999)

        const { data } = await supabase
          .from('k24_orders')
          .select('number, custom_number, deadline, status')
          .lte('deadline', tomorrow.toISOString().split('T')[0])
          .not('status', 'in', '("done","cancelled")')
          .order('deadline')
          .limit(5)

        if (!data || data.length === 0) return

        // Check localStorage for dismissed alerts today (use local date, not UTC)
        const now = new Date()
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const dismissKey = `deadline_alerts_${today}`
        const dismissed = JSON.parse(localStorage.getItem(dismissKey) || '[]')

        const urgent = data.filter((o) => !dismissed.includes(o.number))
        if (urgent.length === 0) return

        // Show one combined toast
        const overdue = urgent.filter((o) => new Date(o.deadline) < new Date())
        const upcoming = urgent.filter((o) => new Date(o.deadline) >= new Date())

        if (overdue.length > 0) {
          toast.error(`Просрочено: ${overdue.map((o) => `#${formatOrderNumber(o)}`).join(', ')}`)
        }
        if (upcoming.length > 0) {
          toast.info(`Дедлайн сегодня/завтра: ${upcoming.map((o) => `#${formatOrderNumber(o)}`).join(', ')}`)
        }

        // Mark as shown today
        localStorage.setItem(dismissKey, JSON.stringify([...dismissed, ...urgent.map((o) => o.number)]))
      } catch (err) {
        captureError(err, { tags: { source: 'useDeadlineAlerts.checkDeadlines' } })
      }
    }

    // Delay check to not block initial render
    const timer = setTimeout(checkDeadlines, 3000)
    return () => clearTimeout(timer)
  }, [])
}
