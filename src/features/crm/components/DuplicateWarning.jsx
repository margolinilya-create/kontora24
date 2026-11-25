import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDebounce } from '@/shared/hooks/useDebounce'
import { captureError } from '@/shared/lib/sentry'
import { findDuplicates } from '../lib/crm-api'

/**
 * R28.0 — мягкое предупреждение о возможных дублях (не блокирует сохранение).
 */
export function DuplicateWarning({ companyName = '', inn = '', identities = [], excludeCompanyId = null, excludeContactId = null, onNavigate }) {
  const [items, setItems] = useState([])
  const key = JSON.stringify({
    companyName,
    inn,
    identities: identities.map(({ kind, value }) => ({ kind, value })),
    excludeCompanyId,
    excludeContactId,
  })
  const debouncedKey = useDebounce(key, 400)

  useEffect(() => {
    let cancelled = false
    const params = JSON.parse(debouncedKey)
    const hasInput = params.companyName.trim().length >= 3 || String(params.inn).trim() ||
      params.identities.some((r) => String(r.value || '').trim())
    if (!hasInput) {
      setItems([])
      return undefined
    }
    findDuplicates(params)
      .then((found) => { if (!cancelled) setItems(found) })
      .catch((err) => {
        // Поиск дублей — подсказка; ошибка не мешает работе формы.
        captureError(err, { tags: { source: 'crm.DuplicateWarning' } })
        if (!cancelled) setItems([])
      })
    return () => { cancelled = true }
  }, [debouncedKey])

  if (!items.length) return null

  return (
    <div role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-sm">
      <p className="font-medium text-text">Похоже, такой уже есть:</p>
      <ul className="mt-1 space-y-0.5">
        {items.map((d) => {
          const to = d.type === 'company' ? `/crm/clients/${d.id}` : d.clientId ? `/crm/clients/${d.clientId}` : null
          return (
            <li key={`${d.type}:${d.id}`} className="text-text-muted">
              {d.type === 'company' ? 'Клиент' : 'Контакт'}{' '}
              {to ? (
                <Link to={to} onClick={onNavigate} className="text-accent hover:underline">{d.label}</Link>
              ) : (
                <span className="text-text">{d.label}</span>
              )}
              {' — '}{d.reason}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
