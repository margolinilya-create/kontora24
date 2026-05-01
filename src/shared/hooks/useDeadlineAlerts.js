import { useEffect, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'

export function useDeadlineAlerts() {
  const hasChecked = useRef(false)

  useEffect(() => {
    if (hasChecked.current) return
    hasChecked.current = true

    async function checkDeadlines() {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(23, 59, 59, 999)

      const { data } = await supabase
        .from('orders')
        .select('number, deadline, status')
        .lte('deadline', tomorrow.toISOString().split('T')[0])
        .not('status', 'in', '("done","cancelled")')
        .order('deadline')
        .limit(5)

      if (!data || data.length === 0) return

      // Check localStorage for dismissed alerts today
      const today = new Date().toISOString().split('T')[0]
      const dismissKey = `deadline_alerts_${today}`
      const dismissed = JSON.parse(localStorage.getItem(dismissKey) || '[]')

      const urgent = data.filter((o) => !dismissed.includes(o.number))
      if (urgent.length === 0) return

      // Show one combined toast
      const overdue = urgent.filter((o) => new Date(o.deadline) < new Date())
      const upcoming = urgent.filter((o) => new Date(o.deadline) >= new Date())

      if (overdue.length > 0) {
        toast.error(`Просрочено: ${overdue.map((o) => `#${o.number}`).join(', ')}`)
      }
      if (upcoming.length > 0) {
        toast.info(`Дедлайн сегодня/завтра: ${upcoming.map((o) => `#${o.number}`).join(', ')}`)
      }

      // Mark as shown today
      localStorage.setItem(dismissKey, JSON.stringify([...dismissed, ...urgent.map((o) => o.number)]))
    }

    // Delay check to not block initial render
    const timer = setTimeout(checkDeadlines, 3000)
    return () => clearTimeout(timer)
  }, [])
}
