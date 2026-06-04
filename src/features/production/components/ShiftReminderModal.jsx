import { useEffect, useRef, useState } from 'react'
import ConfirmDialog from '@/shared/components/ConfirmDialog'
import { useShiftTracker } from '../hooks/useShiftTracker'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

const PRODUCTION_ROLES = new Set(['printer', 'post_printer', 'designer'])

const START_DISMISS_KEY = 'shift_start_dismissed'
const END_DISMISS_KEY = 'shift_end_dismissed'
const SHIFT_DURATION_MS = 8 * 60 * 60 * 1000 // 8 часов
const TICK_MS = 5 * 60 * 1000               // проверка раз в 5 мин

/**
 * Auto-попапы учёта смен (фидбэк менеджера 17.05):
 *  • При открытии приложения, если работник не на смене — «Начать смену?»
 *  • После 8 часов от started_at — «Завершить смену?»
 *
 * Триггерится только для production-ролей. Dismiss хранится в sessionStorage
 * (сбрасывается при перезагрузке вкладки — это намеренно).
 */
export function ShiftReminderModal() {
  const { profile, hasRole: _hasRole } = useAuth()
  const { isOnShift, activeShift, loading, clockIn, clockOut } = useShiftTracker()
  const [showStart, setShowStart] = useState(false)
  const [showEnd, setShowEnd] = useState(false)
  const [busy, setBusy] = useState(false)
  const tickRef = useRef(null)

  const isProductionRole = profile && PRODUCTION_ROLES.has(profile.role)

  useEffect(() => {
    if (!profile || loading || !isProductionRole) return
    // Старт смены: если не на смене и юзер не отклонил подсказку в этой вкладке
    if (!isOnShift && !sessionStorage.getItem(START_DISMISS_KEY)) {
      setShowStart(true)
    }
  }, [profile, loading, isOnShift, isProductionRole])

  // Поллер для напоминания о конце смены (после 8ч)
  useEffect(() => {
    if (!profile || !isProductionRole || !isOnShift || !activeShift) return
    function checkEnd() {
      const started = new Date(activeShift.started_at).getTime()
      if (Date.now() - started >= SHIFT_DURATION_MS && !sessionStorage.getItem(END_DISMISS_KEY)) {
        setShowEnd(true)
      }
    }
    checkEnd()
    tickRef.current = setInterval(checkEnd, TICK_MS)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [profile, isOnShift, activeShift, isProductionRole])

  async function handleStart() {
    setBusy(true)
    try {
      await clockIn()
      toast.success('Смена начата')
      setShowStart(false)
      sessionStorage.removeItem(START_DISMISS_KEY)
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleEnd() {
    setBusy(true)
    try {
      const res = await clockOut()
      const min = res?.durationMinutes || 0
      const hours = Math.floor(min / 60)
      const mins = min % 60
      const human = hours > 0 ? `${hours}ч ${mins}мин` : `${mins}мин`
      toast.success(`Смена завершена · ${human} сохранено`)
      setShowEnd(false)
      sessionStorage.removeItem(END_DISMISS_KEY)
      sessionStorage.removeItem(START_DISMISS_KEY)
    } catch (err) {
      toast.error(translateError(err).message || err.message)
    } finally {
      setBusy(false)
    }
  }

  function dismissStart() {
    sessionStorage.setItem(START_DISMISS_KEY, '1')
    setShowStart(false)
  }
  function dismissEnd() {
    sessionStorage.setItem(END_DISMISS_KEY, '1')
    setShowEnd(false)
  }

  if (!isProductionRole) return null

  return (
    <>
      <ConfirmDialog
        isOpen={showStart}
        onClose={dismissStart}
        onConfirm={busy ? undefined : handleStart}
        title="Начать смену?"
        message="Вы открыли приложение и ещё не начали смену. Запустить учёт рабочего времени?"
        confirmText={busy ? 'Запускаем…' : 'Начать смену'}
        variant="primary"
      />
      <ConfirmDialog
        isOpen={showEnd}
        onClose={dismissEnd}
        onConfirm={busy ? undefined : handleEnd}
        title="Завершить смену?"
        message="Прошло более 8 часов с начала смены. Зафиксировать окончание рабочего дня?"
        confirmText={busy ? 'Завершаем…' : 'Завершить смену'}
        variant="primary"
      />
    </>
  )
}
