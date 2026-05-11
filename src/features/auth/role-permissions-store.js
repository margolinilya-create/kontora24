import { create } from 'zustand'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'

/**
 * Хранилище динамических прав ролей.
 *
 * Загружается один раз при логине (см. auth/store.js → fetchProfileForUser).
 * Используется через хук useCanDo(permission) и геттер canRoleDo(role, permission).
 *
 * Структура: { [role: string]: Set<permission> }
 * — для O(1) lookup без перепаковки.
 *
 * После изменений через UI (RolePermissionsTable) — вызывается load() и
 * все компоненты с useCanDo автоматически перерендериваются (через zustand subscribe).
 */
export const useRolePermissionsStore = create((set) => ({
  permissions: {},
  loaded: false,
  loading: false,
  error: null,

  async load() {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('k24_role_permissions')
        .select('role, permission, allowed')
      if (error) throw error
      const grouped = {}
      for (const row of data || []) {
        if (!row.allowed) continue
        if (!grouped[row.role]) grouped[row.role] = new Set()
        grouped[row.role].add(row.permission)
      }
      set({ permissions: grouped, loaded: true, loading: false })
    } catch (err) {
      captureError(err, { tags: { source: 'rolePermissionsStore.load' } })
      set({ loading: false, error: err, loaded: true })
    }
  },

  async setPermission(role, permission, allowed) {
    const { error } = await supabase
      .from('k24_role_permissions')
      .upsert({ role, permission, allowed, updated_at: new Date().toISOString() })
    if (error) throw error
    // Оптимистично обновляем локально
    set((state) => {
      const grouped = { ...state.permissions }
      if (!grouped[role]) grouped[role] = new Set()
      else grouped[role] = new Set(grouped[role])
      if (allowed) grouped[role].add(permission)
      else grouped[role].delete(permission)
      return { permissions: grouped }
    })
  },

  reset() {
    set({ permissions: {}, loaded: false, error: null })
  },
}))

/**
 * Синхронный геттер для использования вне React (production-logs, getNextStatus и т.п.).
 * Если стор ещё не загружен — возвращает false (роль не имеет прав).
 */
export function canRoleDo(role, permission) {
  if (!role || !permission) return false
  const perms = useRolePermissionsStore.getState().permissions
  return perms[role]?.has(permission) || false
}
