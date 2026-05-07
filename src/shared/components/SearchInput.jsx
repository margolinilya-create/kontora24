export default function SearchInput({ value, onChange, placeholder = 'Поиск...', ariaLabel = 'Поиск', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-border text-sm bg-surface text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange({ target: { value: '' } })}
          aria-label="Очистить поиск"
          className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors rounded p-2 min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
