import { useState } from 'react'
import { updateOrder, useProfiles } from '../hooks/useOrders'
import { toast } from '@/shared/stores/toast-store'
import { PRIORITIES } from '@/shared/constants'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'

export function OrderEditForm({ order, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    notes: order.notes || '',
    deadline: order.deadline ? order.deadline.split('T')[0] : '',
    assigned_to: order.assigned_to || '',
    priority: order.priority || 'normal',
  })
  const [saving, setSaving] = useState(false)

  // Load profiles for assignee dropdown
  const profiles = useProfiles()

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateOrder(order.id, {
        notes: form.notes || null,
        deadline: form.deadline || null,
        assigned_to: form.assigned_to || null,
        priority: form.priority || 'normal',
      })
      toast.success('Заказ обновлён')
      setEditing(false)
      onSaved?.()
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-sm text-accent hover:underline"
      >
        Редактировать
      </button>
    )
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Редактирование</h3>
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Отмена</Button>
      </div>

      <div>
        <label htmlFor="edit-assignee" className="block text-sm font-medium mb-1.5">Исполнитель</label>
        <select
          id="edit-assignee"
          value={form.assigned_to}
          onChange={(e) => update('assigned_to', e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          <option value="">Не назначен</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name} ({p.role})
            </option>
          ))}
        </select>
      </div>

      <div>
        <Input
          label="Дедлайн"
          id="edit-deadline"
          type="date"
          value={form.deadline}
          onChange={(e) => update('deadline', e.target.value)}
        />
        {form.deadline && new Date(form.deadline) < new Date(new Date().toDateString()) && (
          <p className="text-xs text-warning mt-1">Дедлайн в прошлом</p>
        )}
      </div>

      <div>
        <label htmlFor="edit-priority" className="block text-sm font-medium mb-1.5">Приоритет</label>
        <select
          id="edit-priority"
          value={form.priority || 'normal'}
          onChange={(e) => update('priority', e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          {Object.entries(PRIORITIES).map(([key, p]) => (
            <option key={key} value={key}>{p.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="edit-notes" className="block text-sm font-medium mb-1.5">Заметки</label>
        <textarea
          id="edit-notes"
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
        />
      </div>

      <Button
        onClick={handleSave}
        loading={saving}
        className="w-full"
      >
        Сохранить
      </Button>
    </div>
  )
}
