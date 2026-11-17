import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { getFreshAccessToken } from '@/shared/lib/auth-token'
import { toast } from '@/shared/stores/toast-store'
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus'
import { readApiResponse, apiErrorMessage } from '../lib/api-response'

/**
 * Флаг «компонент смонтирован» — защита от setState после unmount
 * (ответ сети пришёл, когда вкладку настроек уже закрыли).
 */
function useMountedRef() {
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  return mounted
}

export function useSettings(key) {
  const [value, setValue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mounted = useMountedRef()
  // Спиннер только на первой загрузке: фоновый рефетч (фокус вкладки) не должен
  // размонтировать форму и терять ввод.
  const loadedOnceRef = useRef(false)

  const fetchSettings = useCallback(async () => {
    if (!loadedOnceRef.current) setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.from('k24_settings').select('value').eq('key', key).single()
      // PGRST116 = no rows; first-run scenario, not a real error
      if (err && err.code !== 'PGRST116') throw err
      if (!mounted.current) return
      setValue(data?.value || null)
      loadedOnceRef.current = true
    } catch (err) {
      if (mounted.current) setError(err)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [key, mounted])

  // Смена ключа — снова показываем первичную загрузку.
  useEffect(() => { loadedOnceRef.current = false }, [key])

  useEffect(() => { fetchSettings() }, [fetchSettings])
  useRefetchOnFocus(fetchSettings)

  async function saveSettings(newValue) {
    const { error } = await supabase
      .from('k24_settings')
      .upsert({ key, value: newValue, updated_at: new Date().toISOString() })
    if (error) throw error
    if (mounted.current) setValue(newValue)
    toast.success('Настройки сохранены')
  }

  return { value, loading, error, save: saveSettings, refetch: fetchSettings }
}

export function useUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mounted = useMountedRef()
  const loadedOnceRef = useRef(false)

  const fetchUsers = useCallback(async () => {
    if (!loadedOnceRef.current) setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('k24_profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (err) throw err
      if (!mounted.current) return
      setUsers(data || [])
      loadedOnceRef.current = true
    } catch (err) {
      if (mounted.current) setError(err)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [mounted])

  useEffect(() => { fetchUsers() }, [fetchUsers])
  useRefetchOnFocus(fetchUsers)

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
    const accessToken = await getFreshAccessToken()
    const res = await fetch('/api/users/update', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ userId, ...updates }),
    })
    const result = await readApiResponse(res)
    if (!res.ok) throw new Error(apiErrorMessage(res, result, 'Не удалось обновить пользователя'))
    toast.success('Пользователь обновлён')
    fetchUsers()
  }

  async function deleteUser(userId) {
    const accessToken = await getFreshAccessToken()
    const res = await fetch('/api/users/delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ userId }),
    })
    const result = await readApiResponse(res)
    if (!res.ok) throw new Error(apiErrorMessage(res, result, 'Не удалось удалить пользователя'))
    toast.success('Пользователь удалён')
    fetchUsers()
  }

  return { users, loading, error, updateUserRole, updateUser, deleteUser, refetch: fetchUsers }
}
