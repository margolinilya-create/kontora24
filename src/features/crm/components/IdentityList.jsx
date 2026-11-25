import { IDENTITY_KINDS, identityDisplay, identityHref } from '../lib/identity'

/** R28.0 — каналы связи контакта, кликабельно (tel:/mailto:/t.me). */
export function IdentityList({ identities, compact = false }) {
  const sorted = [...(identities || [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  const shown = compact ? sorted.filter((i) => i.is_primary).slice(0, 2) : sorted
  if (!shown.length) return compact ? null : <p className="text-sm text-text-muted">Нет данных для связи</p>
  return (
    <ul className={compact ? 'flex flex-wrap gap-x-3 gap-y-0.5' : 'space-y-1'}>
      {shown.map((i) => {
        const href = identityHref(i)
        const text = identityDisplay(i)
        return (
          <li key={i.id || `${i.kind}:${i.value_norm}`} className="text-sm">
            {!compact && <span className="text-text-muted">{IDENTITY_KINDS[i.kind]?.label || i.kind}: </span>}
            {href ? (
              <a
                href={href}
                target={i.kind === 'telegram' ? '_blank' : undefined}
                rel={i.kind === 'telegram' ? 'noopener noreferrer' : undefined}
                onClick={(e) => e.stopPropagation()}
                className="text-accent hover:underline break-all"
              >
                {text}
              </a>
            ) : (
              <span className="break-all">{text}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
