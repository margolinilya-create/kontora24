import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '@/shared/components/Modal'
import { useCanDo } from '@/features/auth/hooks/useCanDo'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { captureError } from '@/shared/lib/sentry'
import { globalSearch } from '../lib/crm-ops'

function Palette({ onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const debounced = useDebounce(query, 250)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    let cancelled = false
    if (debounced.trim().length < 2) {
      setResults([])
      return undefined
    }
    setLoading(true)
    globalSearch(debounced)
      .then((r) => { if (!cancelled) { setResults(r); setActive(0) } })
      .catch((err) => { captureError(err, { tags: { source: 'crm.CommandPalette' } }); if (!cancelled) setResults([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debounced])

  function go(r) {
    onClose()
    navigate(r.to)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && results[active]) go(results[active])
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Клиент, телефон, email, сделка, номер заказа…"
        aria-label="Поиск"
        className="w-full rounded-xl border border-border px-3.5 py-3 text-base bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/60"
      />
      {loading && <p className="text-xs text-text-muted px-1">Ищу…</p>}
      {!loading && debounced.trim().length >= 2 && results.length === 0 && <p className="text-sm text-text-muted px-1 py-2">Ничего не нашли</p>}
      <ul role="listbox" className="max-h-80 overflow-auto">
        {results.map((r, i) => (
          <li key={r.id} role="option" aria-selected={i === active}>
            <button
              onClick={() => go(r)}
              onMouseEnter={() => setActive(i)}
              className={`w-full text-left px-3 py-2 rounded-lg flex items-baseline gap-2 ${i === active ? 'bg-accent/10' : ''}`}
            >
              <span className="text-[11px] text-text-muted w-16 shrink-0">{r.type}</span>
              <span className="min-w-0">
                <span className="text-sm font-medium block truncate">{r.title}</span>
                {r.subtitle && <span className="text-xs text-text-muted block truncate">{r.subtitle}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * R28.3 — глобальный поиск по Ctrl+K / Cmd+K (+ кнопка в шапке).
 * Только при праве view:crm; иначе ничего не рендерит и не слушает клавиши.
 */
export function CommandPalette() {
  const canCrm = useCanDo('view:crm')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!canCrm) return undefined
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && ['k', 'K', 'л', 'Л'].includes(e.key)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canCrm])

  if (!canCrm) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Поиск (Ctrl+K)"
        title="Поиск (Ctrl+K)"
        className="p-2.5 rounded-xl hover:bg-surface-2 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-text-muted"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" /></svg>
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Поиск" maxWidth="max-w-xl">
        {open && <Palette onClose={() => setOpen(false)} />}
      </Modal>
    </>
  )
}
