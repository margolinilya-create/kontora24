import { useEffect, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import { captureError } from '@/shared/lib/sentry'
import { formatOrderNumber } from '@/shared/lib/utils'

/** Дата YYYY-MM-DD по локальному календарю устройства (в цеху — Москва), не UTC. */
export function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Делит заказы на просроченные (дедлайн раньше сегодняшнего дня) и ближайшие
 * (сегодня/завтра). Сравнение по календарному дню: `deadline` — DATE без времени,
 * и `new Date('2026-11-17')` = полночь UTC (03:00 МСК), из-за чего сегодняшний
 * дедлайн считался просроченным уже с утра.
 */
export function splitByDeadline(orders, now = new Date()) {
  const today = localDateKey(now)
  const overdue = []
  const upcoming = []
  for (const o of orders) {
    const day = String(o.deadline || '').slice(0, 10)
    if (!day) continue
    if (day < today) overdue.push(o)
    else upcoming.push(o)
  }
  return { overdue, upcoming }
}

export function useDeadlineAlerts() {
  const hasChecked = useRef(false)

  useEffect(() => {
    if (hasChecked.current) return
    hasChecked.current = true

    async function checkDeadlines() {
      try {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)

        const { data, error } = await supabase
          .from('k24_orders')
          .select('number, custom_number, deadline, status')
          .lte('deadline', localDateKey(tomorrow))
          .not('status', 'in', '("done","cancelled")')
          .order('deadline')
          .limit(5)
        if (error) throw error

        if (!data || data.length === 0) return

        // Check localStorage for dismissed alerts today (use local date, not UTC)
        const today = localDateKey(new Date())
        const dismissKey = `deadline_alerts_${today}`
        const dismissed = JSON.parse(localStorage.getItem(dismissKey) || '[]')

        const urgent = data.filter((o) => !dismissed.includes(o.number))
        if (urgent.length === 0) return

        // Show one combined toast
        const { overdue, upcoming } = splitByDeadline(urgent)

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
