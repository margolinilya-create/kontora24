import { useToastStore } from '@/shared/stores/toast-store'

const STYLES = {
  success: 'bg-success text-white',
  error: 'bg-danger text-white',
  info: 'bg-blue-600 text-white',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${STYLES[t.type] || STYLES.info} px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center justify-between gap-3 animate-slide-in`}
        >
          <span>{t.message}</span>
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
