import { useState } from 'react'
import { ROLES } from '@/shared/constants'
import { getFreshAccessToken } from '@/shared/lib/auth-token'
import { toast } from '@/shared/stores/toast-store'
import { translateError } from '@/shared/lib/error-translator'
import Button from '@/shared/components/Button'
import Input from '@/shared/components/Input'

export function CreateUser() {
  const [form, setForm] = useState({ display_name: '', email: '', password: '', role: 'post_printer' })
  const [saving, setSaving] = useState(false)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.display_name || !form.email || !form.password) return
    setSaving(true)
    try {
      const accessToken = await getFreshAccessToken()
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(form),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      toast.success(`Пользователь ${form.display_name} создан`)
      setForm({ display_name: '', email: '', password: '', role: 'post_printer' })
    } catch (err) {
      toast.error(translateError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Добавить пользователя</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Имя"
            value={form.display_name}
            onChange={(e) => update('display_name', e.target.value)}
            placeholder="Иван Петров"
            required
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="ivan@example.com"
            required
          />
          <Input
            label="Пароль"
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            placeholder="Минимум 6 символов"
            minLength={6}
            required
          />
          <div>
            <label htmlFor="new-user-role" className="block text-sm font-medium text-text mb-1">Роль</label>
            <select
              id="new-user-role"
              value={form.role}
              onChange={(e) => update('role', e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              {Object.entries(ROLES).map(([key, r]) => (
                <option key={key} value={key}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Создать пользователя
        </Button>
      </form>
    </div>
  )
}
