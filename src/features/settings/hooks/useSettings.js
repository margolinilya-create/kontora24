import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/stores/toast-store'

export function useSettings(key) {
  const [value, setValue] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('k24_settings').select('value').eq('key', key).single()
    setValue(data?.value || null)
    setLoading(false)
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

  return { value, loading, save: saveSettings, refetch: fetchSettings }
}

export function useUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('k24_profiles')
      .select('*')
      .order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
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

  return { users, loading, updateUserRole, refetch: fetchUsers }
}
