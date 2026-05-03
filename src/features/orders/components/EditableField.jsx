import { useState } from 'react'
import { updateOrder } from '../hooks/useOrders'
import { toast } from '@/shared/stores/toast-store'

export function EditableField({ label, field, order, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(order[field] || '')

  async function save() {
    try {
      await updateOrder(order.id, { [field]: value || null })
      setEditing(false)
      onSaved()
    } catch {
      toast.error('Ошибка сохранения')
    }
  }

  if (editing) {
    return (
      <div>
        <p className="text-xs text-text-muted uppercase mb-1">{label}</p>
        <div className="flex gap-1">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="border border-border rounded px-2 py-1 text-sm w-full bg-surface"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          />
          <button onClick={save} className="text-accent text-sm font-medium">OK</button>
        </div>
      </div>
    )
  }

  return (
    <div className="cursor-pointer" onClick={() => setEditing(true)} title="Нажмите для редактирования">
      <p className="text-xs text-text-muted uppercase">{label}</p>
      <p className="font-medium">{order[field] || '—'}</p>
    </div>
  )
}
