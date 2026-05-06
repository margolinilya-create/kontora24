import { useState } from 'react'
import { ROLES } from '@/shared/constants'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'
import Modal from '@/shared/components/Modal'

export function EditUserModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    display_name: user.display_name || '',
    email: user.email || '',
    role: user.role,
    approved: user.approved !== false,
  })
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.display_name.trim()) return

    setSaving(true)
    try {
      const updates = {}
      if (form.display_name !== user.display_name) updates.display_name = form.display_name
      if (form.email !== user.email) updates.email = form.email
      if (form.role !== user.role) updates.role = form.role
      if (form.approved !== (user.approved !== false)) updates.approved = form.approved
      if (password) updates.password = password

      if (Object.keys(updates).length === 0) {
        onClose()
        return
      }

      await onSave(user.id, updates)
      onClose()
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Редактировать пользователя" maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Имя"
          value={form.display_name}
          onChange={(e) => update('display_name', e.target.value)}
          required
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
        />
        <div>
          <label htmlFor="edit-user-role" className="block text-sm font-medium text-text mb-1">Роль</label>
          <select
            id="edit-user-role"
            value={form.role}
            onChange={(e) => update('role', e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            {Object.entries(ROLES).map(([key, r]) => (
              <option key={key} value={key}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="edit-user-approved"
            type="checkbox"
            checked={form.approved}
            onChange={(e) => update('approved', e.target.checked)}
            className="rounded border-border text-accent focus:ring-accent/50"
          />
          <label htmlFor="edit-user-approved" className="text-sm">
            Активен (может входить в систему)
          </label>
        </div>
        <div className="border-t border-border pt-4">
          <Input
            label="Новый пароль (оставьте пустым, чтобы не менять)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Минимум 6 символов"
            minLength={6}
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="submit" loading={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  )
}
