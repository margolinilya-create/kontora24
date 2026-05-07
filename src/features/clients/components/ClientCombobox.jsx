import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { createClient } from '../hooks/useClients'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import { captureError } from '@/shared/lib/sentry'

export function ClientCombobox({ currentClient, onChange, placeholder = 'Не выбран', id }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const debouncedQuery = useDebounce(query, 200)

  const displayValue = currentClient?.name || ''

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function fetchClients() {
      setLoading(true)
      try {
        let q = supabase
          .from('k24_clients')
          .select('id, name, phone, email')
          .order('name')
          .limit(20)
        const search = debouncedQuery.replace(/[,()]/g, '').trim()
        if (search) {
          q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
        }
        const { data, error } = await q
        if (cancelled) return
        if (error) throw error
        setResults(data || [])
      } catch (err) {
        captureError(err, { tags: { source: 'ClientCombobox.fetch' } })
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchClients()
    return () => { cancelled = true }
  }, [debouncedQuery, open])

  function handleOpen() {
    setOpen(true)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function handleSelect(client) {
    onChange(client.id, client)
    setOpen(false)
    setQuery('')
  }

  function handleClear(e) {
    e.stopPropagation()
    onChange(null, null)
    setOpen(false)
    setQuery('')
  }

  async function handleCreate() {
    const name = query.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const client = await createClient({ name })
      toast.success(`Клиент «${client.name}» создан`)
      onChange(client.id, client)
      setOpen(false)
      setQuery('')
    } catch (err) {
      captureError(err, { tags: { source: 'ClientCombobox.create' } })
      toast.error(translateError(err).message)
    } finally {
      setCreating(false)
    }
  }

  const trimmedQuery = query.trim()
  const exactMatch = results.some((c) => c.name.toLowerCase() === trimmedQuery.toLowerCase())
  const showCreate = trimmedQuery.length > 0 && !exactMatch && !loading

  return (
    <div ref={containerRef} className="relative w-full">
      {!open ? (
        <button
          type="button"
          id={id}
          onClick={handleOpen}
          className="w-full text-left rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent flex items-center justify-between gap-2 hover:bg-surface-2 transition-colors"
        >
          <span className={displayValue ? 'text-text truncate' : 'text-text-muted'}>
            {displayValue || placeholder}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {currentClient && (
              <span
                role="button"
                tabIndex={-1}
                onClick={handleClear}
                aria-label="Убрать клиента"
                className="text-text-muted hover:text-danger text-base leading-none"
              >
                ✕
              </span>
            )}
            <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); setQuery('') }
            if (e.key === 'Enter' && showCreate) { e.preventDefault(); handleCreate() }
          }}
          placeholder="Введите имя или телефон…"
          className="w-full rounded-xl border border-accent bg-surface text-text px-3.5 py-2.5 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/60"
        />
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-surface border border-border rounded-xl shadow-modal max-h-72 overflow-y-auto">
          {loading && (
            <div className="px-3.5 py-3 text-sm text-text-muted">Поиск…</div>
          )}
          {!loading && results.length === 0 && !showCreate && (
            <div className="px-3.5 py-3 text-sm text-text-muted">
              {trimmedQuery ? 'Не найдено' : 'Начните вводить имя или телефон'}
            </div>
          )}
          {!loading && results.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => handleSelect(client)}
              className="w-full text-left px-3.5 py-2 text-sm hover:bg-surface-2 transition-colors flex justify-between items-center gap-2 border-b border-border last:border-b-0"
            >
              <span className="text-text font-medium truncate">{client.name}</span>
              {client.phone && <span className="text-xs text-text-muted shrink-0">{client.phone}</span>}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="w-full text-left px-3.5 py-2.5 text-sm bg-accent/10 hover:bg-accent/20 text-text font-medium border-t border-border disabled:opacity-50"
            >
              + Создать клиента: «{trimmedQuery}»
            </button>
          )}
        </div>
      )}
    </div>
  )
}
