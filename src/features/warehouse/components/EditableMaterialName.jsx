import { useState } from 'react'
import { updateMaterial } from '../hooks/useMaterials'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'

export function EditableMaterialName({ material, onUpdated, tableMode = false }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(material.name || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    const next = value.trim()
    if (!next) { toast.error('Название не может быть пустым'); return }
    if (next === material.name) { setEditing(false); return }
    setSaving(true)
    try {
      await updateMaterial(material.id, { name: next })
      toast.success('Название обновлено')
      setEditing(false)
      onUpdated?.()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className={`flex items-center gap-1 ${tableMode ? '' : 'flex-wrap'}`}>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setValue(material.name || ''); setEditing(false) }
          }}
          className="rounded-md border border-border px-2 py-1 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50 min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="text-accent text-sm font-medium px-1 disabled:opacity-50"
        >
          OK
        </button>
        <button
          type="button"
          onClick={() => { setValue(material.name || ''); setEditing(false) }}
          className="text-text-muted text-sm px-1"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Изменить название"
      className={tableMode
        ? 'text-left hover:text-accent transition-colors w-full'
        : 'font-bold text-base leading-tight text-left hover:text-accent transition-colors'}
    >
      {material.name}
    </button>
  )
}
