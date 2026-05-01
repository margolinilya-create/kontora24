export default function Input({ label, id, ariaLabel, error, className = '', ...props }) {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-')

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
        className={`w-full rounded-lg border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50 ${error ? 'border-danger' : 'border-border'} ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-xs text-danger">{error}</p>
      )}
    </div>
  )
}
