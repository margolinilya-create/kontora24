import { useEffect, useRef, useState } from 'react'

/**
 * Универсальный компонент-выпадайка для выбора одного значения из списка.
 * Используется как mobile-вариант Tabs (фидбэк менеджера 17.05).
 *
 * API совместимо с Tabs: `items: [{ key, label }]`, `active`, `onChange`.
 *
 * На mobile удобнее tap → меню чем горизонтальный скролл табов.
 * Закрывается по клику вне, Escape, выбору пункта.
 */
export default function DropdownMenu({ items, active, onChange, className = '', placeholder = '— выбрать —', align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const activeItem = items.find((i) => i.key === active)
  const label = activeItem?.label || placeholder

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[40px]"
      >
        <span>{label}</span>
        <span className={`text-xs text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className={`absolute z-30 mt-1 min-w-full rounded-xl border border-border bg-surface shadow-xl overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((item) => {
            const isActive = item.key === active
            return (
              <li key={item.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => { onChange(item.key); setOpen(false) }}
                  className={`w-full text-left px-4 py-2.5 text-sm whitespace-nowrap transition-colors ${
                    isActive ? 'bg-accent/10 text-accent font-medium' : 'hover:bg-surface-2 text-text'
                  }`}
                >
                  {item.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
