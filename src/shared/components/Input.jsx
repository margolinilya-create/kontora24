import { useId } from 'react'

export default function Input({ label, id, ariaLabel, error, inputMode, className = '', ...props }) {
  const generatedId = useId()
  const inputId = id || generatedId
  const errorId = error ? `${inputId}-error` : undefined

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-text mb-1">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-label={!label ? ariaLabel : undefined}
        aria-invalid={!!error}
        aria-describedby={errorId}
        inputMode={inputMode}
        className={`w-full rounded-lg border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50 ${error ? 'border-danger' : 'border-border'} ${className}`}
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1 text-xs text-danger" role="alert">{error}</p>
      )}
    </div>
  )
}
