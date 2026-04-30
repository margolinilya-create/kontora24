import { useState } from 'react'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'
import { ROLES } from '@/shared/constants'

export function ProfileCard() {
  const { profile, user } = useAuth()
  const [name, setName] = useState(profile?.display_name || '')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSaveName() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name, name })
        .eq('id', profile.id)
      if (error) throw error
      toast.success('Имя обновлено')
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      toast.error('Минимум 6 символов')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success('Пароль изменён')
      setNewPassword('')
    } catch (err) {
      toast.error('Ошибка: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return null

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <h2 className="font-semibold mb-4">Профиль</h2>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center text-xl font-bold text-accent">
          {profile.display_name?.[0]?.toUpperCase() || 'U'}
        </div>
        <div>
          <p className="font-semibold">{profile.display_name}</p>
          <p className="text-sm text-text-muted">{user?.email}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full ${ROLES[profile.role]?.color || 'bg-gray-100'}`}>
            {ROLES[profile.role]?.label || profile.role}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="profile-name" className="block text-sm font-medium mb-1.5">Отображаемое имя</label>
          <div className="flex gap-2">
            <input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <button
              onClick={handleSaveName}
              disabled={saving || name === profile.display_name}
              className="bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
            >
              Сохранить
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="profile-password" className="block text-sm font-medium mb-1.5">Новый пароль</label>
          <div className="flex gap-2">
            <input
              id="profile-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <button
              onClick={handleChangePassword}
              disabled={saving || !newPassword}
              className="border border-border text-text hover:bg-surface-dim font-medium rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50"
            >
              Изменить
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
