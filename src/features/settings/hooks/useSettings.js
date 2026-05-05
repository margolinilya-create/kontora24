import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'

export function useSettings(key) {
  const [value, setValue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.from('k24_settings').select('value').eq('key', key).single()
      // PGRST116 = no rows; first-run scenario, not a real error
      if (err && err.code !== 'PGRST116') throw err
      setValue(data?.value || null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [key])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  async function saveSettings(newValue) {
    const { error } = await supabase
      .from('k24_settings')
      .upsert({ key, value: newValue, updated_at: new Date().toISOString() })
    if (error) throw error
    setValue(newValue)
    toast.success('Настройки сохранены')
  }

  return { value, loading, error, save: saveSettings, refetch: fetchSettings }
}

export function useUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('k24_profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (err) throw err
      setUsers(data || [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function updateUserRole(userId, newRole) {
    const { error } = await supabase
      .from('k24_profiles')
      .update({ role: newRole })
      .eq('id', userId)
    if (error) throw error
    toast.success('Роль обновлена')
    fetchUsers()
  }

  async function updateUser(userId, updates) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/users/update', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ userId, ...updates }),
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.error)
    toast.success('Пользователь обновлён')
    fetchUsers()
  }

  return { users, loading, error, updateUserRole, updateUser, refetch: fetchUsers }
}
