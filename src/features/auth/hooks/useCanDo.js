import { useAuth } from './useAuth'
import { useRolePermissionsStore, canRoleDo } from '../role-permissions-store'

/**
 * Проверка одного разрешения для текущего пользователя (с учётом impersonation).
 * Реактивен — компонент перерендерится если права изменятся (через UI редактора)
 * или сменится роль (через RoleSwitcher).
 */
export function useCanDo(permission) {
  const { profile } = useAuth()
  const permissions = useRolePermissionsStore((s) => s.permissions)
  if (!profile?.role || !permission) return false
  return permissions[profile.role]?.has(permission) || false
}

/**
 * Хотя бы одно из переданных прав.
 */
export function useCanDoAny(perms) {
  const { profile } = useAuth()
  const permissions = useRolePermissionsStore((s) => s.permissions)
  if (!profile?.role || !Array.isArray(perms) || perms.length === 0) return false
  const rolePerms = permissions[profile.role]
  if (!rolePerms) return false
  return perms.some((p) => rolePerms.has(p))
}

// Re-export для удобства синхронной проверки вне React
export { canRoleDo }
