import { create } from 'zustand'
import { captureError } from '@/shared/lib/sentry'

let toastId = 0

export const useToastStore = create((set) => ({
  toasts: [],

  // R27.0: опциональная кнопка действия { label, onClick } (например,
  // «Повторить»). Нажатие закрывает тост и вызывает onClick.
  addToast: (message, type = 'info', duration = 4000, action = null) => {
    const id = ++toastId
    if (type === 'error') {
      captureError(message, { tags: { source: 'toast' } })
    }
    const act = action && typeof action.onClick === 'function' && action.label
      ? { label: String(action.label), onClick: action.onClick }
      : null
    set((s) => ({ toasts: [...s.toasts, act ? { id, message, type, action: act } : { id, message, type }] }))
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, duration)
    }
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

// Convenience functions
// Второй аргумент (необязательный): { action: { label, onClick } } — тост с
// кнопкой держится дольше (15 с), чтобы успеть нажать.
export const toast = {
  success: (msg, opts) => useToastStore.getState().addToast(msg, 'success', opts?.action ? 15000 : 4000, opts?.action),
  error: (msg, opts) => useToastStore.getState().addToast(msg, 'error', opts?.action ? 15000 : 6000, opts?.action),
  info: (msg, opts) => useToastStore.getState().addToast(msg, 'info', opts?.action ? 15000 : 4000, opts?.action),
}
