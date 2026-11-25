import { useEffect, useRef } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { toast } from '@/shared/stores/toast-store'
import { playNotificationSound } from '@/shared/lib/sound'
import { captureError } from '@/shared/lib/sentry'
import { listMyOpenTasks } from '../lib/feed-api'
import { dueForReminder, TASK_KINDS } from '../lib/feed'

const CHECK_EVERY_MS = 60 * 1000
const STORAGE_KEY = 'k24.crm.reminded'

function readReminded() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}
function writeReminded(ids) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-500)))
  } catch {
    // приватный режим — просто не запоминаем между перезагрузками
  }
}

function Poller({ userId }) {
  const remindedRef = useRef(null)

  useEffect(() => {
    if (remindedRef.current === null) remindedRef.current = readReminded()
    let cancelled = false
    async function check() {
      try {
        const tasks = await listMyOpenTasks(userId)
        if (cancelled) return
        const due = dueForReminder(tasks, remindedRef.current)
        if (!due.length) return
        playNotificationSound()
        for (const t of due.slice(0, 3)) {
          toast.info(`${TASK_KINDS[t.kind]?.icon || ''} Пора: ${t.title}`)
        }
        if (due.length > 3) toast.info(`И ещё задач со сроком: ${due.length - 3}`)
        remindedRef.current = [...remindedRef.current, ...due.map((t) => t.id)]
        writeReminded(remindedRef.current)
      } catch (err) {
        // Напоминание — вспомогательное: только в Sentry, без тостов каждую минуту.
        captureError(err, { tags: { source: 'crm.CrmTaskReminder' } })
      }
    }
    check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [userId])

  return null
}

/**
 * R28.2 — фоновые напоминания о задачах CRM (звук + тост, раз в минуту).
 * Монтируется в Layout; ничего не делает без права view:crm.
 */
export function CrmTaskReminder() {
  const canCrm = useCanDo('view:crm')
  const { user } = useAuth()
  if (!canCrm || !user?.id) return null
  return <Poller userId={user.id} />
}
