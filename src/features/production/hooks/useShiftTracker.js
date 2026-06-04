import { useEffect } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { useShiftStore } from '../stores/shift-tracker-store'

/**
 * Hook for worker shift clock-in / clock-out.
 *
 * R15.0 (бриф 04.06): state переехал в shared Zustand store
 * (см. shift-tracker-store.js). Два компонента — ShiftReminderModal и
 * CabinetPage — раньше держали независимые React-инстансы, что ломало
 * синхронизацию после clockOut из модалки.
 */
export function useShiftTracker() {
  const { profile } = useAuth()
  const activeShift = useShiftStore((s) => s.activeShift)
  const todayMinutes = useShiftStore((s) => s.todayMinutes)
  const loading = useShiftStore((s) => s.loading)
  const error = useShiftStore((s) => s.error)
  const fetch = useShiftStore((s) => s.fetch)
  const clockIn = useShiftStore((s) => s.clockIn)
  const clockOut = useShiftStore((s) => s.clockOut)

  useEffect(() => {
    if (profile?.id) fetch(profile.id)
  }, [profile?.id, fetch])

  useRefetchOnFocus(() => {
    if (profile?.id) fetch(profile.id)
  })

  return {
    isOnShift: !!activeShift,
    activeShift,
    todayMinutes,
    loading,
    error,
    clockIn,
    clockOut,
  }
}
