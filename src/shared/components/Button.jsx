export default function Button({ variant = 'primary', size = 'md', disabled, loading, children, className = '', ...props }) {
  const base = 'font-semibold rounded-xl transition-[background-color,transform,box-shadow] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'
  const variants = {
    primary: 'bg-accent hover:bg-accent-hover text-on-accent shadow-[0_1px_2px_rgba(20,20,20,0.08)]',
    secondary: 'bg-surface border border-border text-text hover:bg-surface-2',
    danger: 'bg-danger hover:brightness-95 text-white shadow-[0_1px_2px_rgba(20,20,20,0.08)]',
    ghost: 'text-text-muted hover:text-text hover:bg-surface-2',
  }
  const sizes = {
    sm: 'px-3 py-2 text-xs min-h-[36px] sm:min-h-[44px]',
    md: 'px-4 py-2.5 text-sm min-h-[44px]',
    lg: 'px-5 py-3 text-sm min-h-[44px]',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="animate-spin rounded-full border-2 border-current border-t-transparent h-4 w-4" aria-hidden="true" />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  )
}
