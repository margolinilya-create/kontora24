import { useToastStore } from '@/shared/stores/toast-store'

const STYLES = {
  success: 'bg-success text-white',
  error: 'bg-danger text-white',
  info: 'bg-info text-white',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  const hasError = toasts.some((t) => t.type === 'error')

  return (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 sm:max-w-sm"
      role={hasError ? 'alert' : 'status'}
      aria-live={hasError ? 'assertive' : 'polite'}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${STYLES[t.type] || STYLES.info} px-4 py-3 rounded-2xl shadow-modal text-sm font-medium flex items-center justify-between gap-3 animate-slide-in`}
        >
          <span className="min-w-0 break-words">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => { removeToast(t.id); t.action.onClick() }}
              className="shrink-0 rounded-xl bg-white/20 hover:bg-white/30 px-3 min-h-[44px] font-semibold"
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => removeToast(t.id)}
            className="opacity-70 hover:opacity-100 text-lg leading-none p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Закрыть"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
