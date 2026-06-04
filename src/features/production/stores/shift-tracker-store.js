import { create } from 'zustand'
import { supabase } from '@/shared/lib/supabase'
import { MS_PER_MINUTE } from '@/shared/constants'
import { captureError } from '@/shared/lib/sentry'

/**
 * Shared shift-tracker store.
 *
 * До R15.0 useShiftTracker был обычным React-хуком с локальным state. Каждый
 * вызов (ShiftReminderModal + CabinetPage) создавал свой инстанс, поэтому
 * clockOut() из модалки оставлял CabinetPage с устаревшим activeShift до
 * следующего фокуса вкладки. Менеджер видел «Завершить смену» в кабинете
 * после того как уже завершил её через модалку (фидбэк 04.06 #13).
 *
 * Zustand store даёт shared state — все компоненты автоматически обновляются
 * после clockIn/clockOut независимо от того, кто их вызвал.
 */
export const useShiftStore = create((set, get) => ({
  activeShift: null,
  todayMinutes: 0,
  loading: true,
  error: null,
  _profileId: null,

  async fetch(profileId) {
    if (!profileId) return
    set({ _profileId: profileId, error: null })
    try {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const [activeRes, todayRes] = await Promise.all([
        supabase
          .from('k24_shift_entries')
          .select('*')
          .eq('worker_id', profileId)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1),
        supabase
          .from('k24_shift_entries')
          .select('duration_minutes')
          .eq('worker_id', profileId)
          .not('ended_at', 'is', null)
          .gte('started_at', today.toISOString()),
      ])
      if (activeRes.error) throw activeRes.error
      if (todayRes.error) throw todayRes.error
      const totalMinutes = (todayRes.data || []).reduce((sum, s) => sum + (s.duration_minutes || 0), 0)
      set({
        activeShift: activeRes.data?.[0] || null,
        todayMinutes: totalMinutes,
        loading: false,
      })
    } catch (err) {
      captureError(err, { tags: { source: 'shiftStore.fetch' } })
      set({ error: err, loading: false })
    }
  },

  async clockIn() {
    const { _profileId, activeShift } = get()
    if (!_profileId || activeShift) return
    const { error } = await supabase.from('k24_shift_entries').insert({
      worker_id: _profileId,
    })
    if (error) throw error
    await get().fetch(_profileId)
  },

  /**
   * Завершает активную смену. Возвращает { durationMinutes } для отображения
   * в toast'е («Смена завершена · 8ч 12мин сохранено»).
   * Optimistic: activeShift сбрасывается до запроса; при ошибке — revert.
   */
  async clockOut() {
    const { _profileId, activeShift } = get()
    if (!_profileId || !activeShift) return null
    const snapshot = activeShift
    const now = new Date()
    const started = new Date(snapshot.started_at)
    const durationMinutes = Math.round((now - started) / MS_PER_MINUTE)

    set({ activeShift: null })  // optimistic — shared между всеми консьюмерами

    try {
      const { error } = await supabase
        .from('k24_shift_entries')
        .update({ ended_at: now.toISOString(), duration_minutes: durationMinutes })
        .eq('id', snapshot.id)
      if (error) throw error
      try { await get().fetch(_profileId) } catch { /* swallow */ }
      return { durationMinutes }
    } catch (err) {
      set({ activeShift: snapshot })  // revert при ошибке
      throw err
    }
  },

  reset() {
    set({ activeShift: null, todayMinutes: 0, loading: true, error: null, _profileId: null })
  },
}))
