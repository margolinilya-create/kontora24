import { useState } from 'react'
import { useSettings, useUsers } from '../hooks/useSettings'
import { ProfileCard } from '../components/ProfileCard'
import { ROLES } from '@/shared/constants'
import { DEFAULTS } from '@/features/calculator/lib/calculator'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import { formatDateTime } from '@/shared/lib/utils'

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Настройки</h1>
        <p className="text-text-muted">Параметры производства и управление пользователями</p>
      </div>

      <ProfileCard />
      <CalculatorSettings />
      <MarkupSettings />
      <UserManagement />
      <InviteUser />
    </div>
  )
}

function CalculatorSettings() {
  const { value: settings, loading, save } = useSettings('calculator')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  // Initialize form when settings load
  if (settings && !form) {
    setForm({ ...DEFAULTS, ...settings })
  }

  if (loading || !form) {
    return (
      <div className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold mb-4">Параметры калькулятора</h2>
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 bg-border/50 rounded" />)}
        </div>
      </div>
    )
  }

  const fields = [
    { key: 'printWidth', label: 'Ширина печатного блока (мм)', step: 1 },
    { key: 'heightMargin', label: 'Тех. отступ по высоте (мм)', step: 1 },
    { key: 'gap', label: 'Зазор между изделиями (мм)', step: 1 },
    { key: 'cutSpeed', label: 'Скорость реза (мм/с)', step: 1 },
    { key: 'lamSpeed', label: 'Скорость ламинации (мм/с)', step: 1 },
    { key: 'resinPerCm2', label: 'Расход смолы (г/см²)', step: 0.001 },
    { key: 'resinPourTime', label: 'Время заливки листа (сек)', step: 1 },
    { key: 'laborCostPerHour', label: 'Стоимость труда (₽/час)', step: 10 },
    { key: 'filmPricePerM2', label: 'Плёнка (₽/м²)', step: 1 },
    { key: 'inkPricePerM2', label: 'Краска (₽/м²)', step: 1 },
    { key: 'resinPricePerG', label: 'Смола (₽/г)', step: 0.01 },
    { key: 'lamPricePerM2', label: 'Ламинация (₽/м²)', step: 1 },
  ]

  async function handleSave() {
    setSaving(true)
    try {
      await save(form)
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Параметры калькулятора</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`calc-${f.key}`} className="block text-sm text-text-muted mb-1">{f.label}</label>
            <input
              id={`calc-${f.key}`}
              type="number"
              value={form[f.key] ?? ''}
              onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
              step={f.step}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-5 py-2.5 text-sm transition-colors disabled:opacity-50"
      >
        {saving ? 'Сохранение...' : 'Сохранить настройки'}
      </button>
    </div>
  )
}

function UserManagement() {
  const { users, loading, updateUserRole } = useUsers()

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Пользователи</h2>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-border/50 rounded" />)}
        </div>
      ) : users.length === 0 ? (
        <p className="text-text-muted text-sm">Нет пользователей</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium text-text-muted">Имя</th>
                <th className="text-left py-2 font-medium text-text-muted">Email</th>
                <th className="text-left py-2 font-medium text-text-muted">Роль</th>
                <th className="text-right py-2 font-medium text-text-muted">Добавлен</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0">
                  <td className="py-3 font-medium">{user.display_name || user.name}</td>
                  <td className="py-3 text-text-muted">{user.email || '—'}</td>
                  <td className="py-3">
                    <select
                      value={user.role}
                      onChange={(e) => updateUserRole(user.id, e.target.value)}
                      className="rounded border border-border px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-accent/50"
                    >
                      {Object.entries(ROLES).map(([key, r]) => (
                        <option key={key} value={key}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 text-right text-text-muted text-xs">{formatDateTime(user.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MarkupSettings() {
  const { value: markups, loading, save } = useSettings('markups')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  const defaultMarkups = {
    sticker_cut: 4.0, sticker_kiss: 4.0, stickerpack: 4.0,
    sticker3D: 4.5, stickerpack3D: 4.5, rect: 4.0, big: 4.0,
  }

  if (markups && !form) setForm({ ...defaultMarkups, ...markups })
  if (!form && !loading) setForm(defaultMarkups)

  async function handleSave() {
    setSaving(true)
    try { await save(form) } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  if (loading || !form) return null

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Наценки по типам</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Object.entries(form).map(([key, val]) => (
          <div key={key}>
            <label className="block text-xs text-text-muted mb-1">{key}</label>
            <input
              type="number"
              value={val}
              onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
              step="0.1"
              min="1"
              className="w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
        ))}
      </div>
      <button onClick={handleSave} disabled={saving} className="mt-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50">
        {saving ? '...' : 'Сохранить наценки'}
      </button>
    </div>
  )
}

function InviteUser() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)

  async function handleInvite(e) {
    e.preventDefault()
    if (!email) return
    setSending(true)
    try {
      const { error } = await supabase.auth.admin.inviteUserByEmail(email)
      if (error) throw error
      toast.success(`Приглашение отправлено на ${email}`)
      setEmail('')
    } catch (err) {
      // Fallback: try magic link if admin API not available
      try {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
        if (error) throw error
        toast.success(`Ссылка для входа отправлена на ${email}`)
        setEmail('')
      } catch (err2) {
        toast.error('Ошибка: ' + (err2.message || err.message))
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Пригласить пользователя</h2>
      <form onSubmit={handleInvite} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          required
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <button type="submit" disabled={sending} className="bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50">
          {sending ? '...' : 'Пригласить'}
        </button>
      </form>
      <p className="text-xs text-text-muted mt-2">Новый пользователь получит роль "Сборщик". Роль можно изменить выше.</p>
    </div>
  )
}
