import { formatInt } from '../lib/copy-text'

/**
 * Переключатель опции калькулятора с чипом «+X ₽» / «−X ₽» — изменение
 * стоимости тиража при включении (при остальных опциях как сейчас).
 */
export function OptionToggle({ id, label, checked, onChange, delta, hint, children }) {
  const rounded = Math.round(delta || 0)
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <label htmlFor={id} className="flex items-center gap-3 cursor-pointer min-h-[32px]">
        <span className="relative inline-flex shrink-0">
          <input
            id={id}
            type="checkbox"
            role="switch"
            aria-checked={checked}
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="peer sr-only"
          />
          <span className="w-10 h-6 rounded-full bg-surface-2 border border-border peer-checked:bg-accent peer-checked:border-accent transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60" />
          <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
        </span>
        <span className="flex-1 min-w-0 text-sm font-medium text-text">
          {label}
          {hint && <span className="block text-xs font-normal text-text-muted">{hint}</span>}
        </span>
        {rounded !== 0 && (
          <span
            className={`shrink-0 text-xs font-semibold tabular-nums rounded-full px-2 py-0.5 ${
              rounded > 0 ? 'bg-surface-2 text-text' : 'bg-success/10 text-success'
            }`}
          >
            {rounded > 0 ? '+' : '−'}{formatInt(Math.abs(rounded))} ₽
          </span>
        )}
      </label>
      {children && checked && <div className="mt-2.5">{children}</div>}
    </div>
  )
}
