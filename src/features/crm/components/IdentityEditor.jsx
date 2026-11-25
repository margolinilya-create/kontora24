import { IDENTITY_KINDS, identityError } from '../lib/identity'

const SELECT_CLS = 'rounded-xl border border-border px-2.5 py-2.5 text-sm bg-surface text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/60'

/**
 * R28.0 — редактор каналов связи контакта: список строк { kind, value, is_primary }.
 */
export function IdentityEditor({ rows, onChange }) {
  function update(i, patch) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function setPrimary(i) {
    const kind = rows[i].kind
    onChange(rows.map((r, idx) => (r.kind === kind ? { ...r, is_primary: idx === i } : r)))
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium mb-1.5">Связь</legend>
      {rows.map((row, i) => {
        const meta = IDENTITY_KINDS[row.kind] || IDENTITY_KINDS.other
        const err = identityError(row.kind, row.value)
        return (
          <div key={i}>
            <div className="flex gap-2 items-center">
              <select
                aria-label="Вид связи"
                value={row.kind}
                onChange={(e) => update(i, { kind: e.target.value, is_primary: false })}
                className={SELECT_CLS}
              >
                {Object.entries(IDENTITY_KINDS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
              <input
                aria-label={meta.label}
                value={row.value}
                inputMode={meta.inputMode}
                placeholder={meta.placeholder}
                onChange={(e) => update(i, { value: e.target.value })}
                aria-invalid={!!err}
                className={`flex-1 min-w-0 rounded-xl border px-3.5 py-2.5 text-sm bg-surface text-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent/60 ${err ? 'border-danger' : 'border-border'}`}
              />
              <button
                type="button"
                onClick={() => setPrimary(i)}
                title="Основной"
                aria-label="Сделать основным"
                aria-pressed={!!row.is_primary}
                className={`min-w-[44px] min-h-[44px] rounded-xl text-lg ${row.is_primary ? 'text-warning' : 'text-text-muted hover:text-text'}`}
              >
                ★
              </button>
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                aria-label="Удалить"
                className="min-w-[44px] min-h-[44px] rounded-xl text-text-muted hover:text-danger"
              >
                ✕
              </button>
            </div>
            {err && <p className="mt-1 text-xs text-danger" role="alert">{err}</p>}
          </div>
        )
      })}
      <div className="flex flex-wrap gap-x-4">
        {['phone', 'email', 'telegram'].map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onChange([...rows, { kind, value: '', is_primary: !rows.some((r) => r.kind === kind) }])}
            className="text-sm text-accent hover:underline min-h-[36px]"
          >
            + {IDENTITY_KINDS[kind].label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
