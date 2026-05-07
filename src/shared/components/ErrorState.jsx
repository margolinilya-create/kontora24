import { useNavigate } from 'react-router-dom'
import { translateError } from '@/shared/lib/error-translator'

export default function ErrorState({ error, onRetry, hideHomeButton = false }) {
  const navigate = useNavigate()
  const { title, message } = translateError(error)

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[40vh] p-6 text-center"
    >
      <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-danger"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-text-muted text-sm mb-4 max-w-md">{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {typeof onRetry === 'function' && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center min-h-[44px] bg-accent hover:bg-accent-hover text-on-accent font-medium rounded-lg px-5 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            Повторить
          </button>
        )}
        {!hideHomeButton && (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center justify-center min-h-[44px] border border-border text-text-muted hover:text-text hover:bg-surface-dim font-medium rounded-lg px-5 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            На главную
          </button>
        )}
      </div>
    </div>
  )
}
