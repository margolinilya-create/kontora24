import { useState, useEffect, useRef } from 'react'

/**
 * Универсальный компонент мульти-select со списком в выпадающей панели.
 * options: [{ value, label }]
 * value: array of selected values
 * onChange: (newArray) => void
 */
export default function MultiSelect({ label, options, value = [], onChange, allLabel = 'Все' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function toggle(v) {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v))
    } else {
      onChange([...value, v])
    }
  }

  const summary = value.length === 0
    ? allLabel
    : value.length === 1
      ? options.find((o) => o.value === value[0])?.label || value[0]
      : `${value.length} выбрано`

  return (
    <div ref={ref} className="relative">
      {label && <label className="block text-xs text-text-muted mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="min-w-[10rem] flex items-center justify-between gap-2 rounded-lg border border-border bg-surface text-sm px-3 py-2 hover:border-accent/40 transition-colors"
      >
        <span className="truncate">{summary}</span>
        <span className="text-text-muted text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-[14rem] max-h-64 overflow-y-auto bg-surface border border-border rounded-xl shadow-modal py-1">
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:bg-surface-2 transition-colors"
            >
              Очистить
            </button>
          )}
          {options.map((opt) => {
            const checked = value.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-2 transition-colors"
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    checked ? 'bg-accent border-accent text-on-accent' : 'border-border'
                  }`}
                  aria-hidden="true"
                >
                  {checked && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="truncate">{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
