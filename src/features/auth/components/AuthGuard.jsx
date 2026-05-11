import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRolePermissionsStore } from '../role-permissions-store'
import Spinner from '@/shared/components/Spinner'

/**
 * @param {Object} props
 * @param {string[]} [props.roles] — legacy: разрешённые роли
 * @param {string} [props.permission] — L2: проверка через k24_role_permissions
 */
export function AuthGuard({ children, roles, permission }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()
  const permsLoaded = useRolePermissionsStore((s) => s.loaded)
  const permissions = useRolePermissionsStore((s) => s.permissions)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    )
  }

  // L2: permission-based check (если указан)
  if (permission) {
    if (!permsLoaded) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Spinner />
        </div>
      )
    }
    if (!permissions[profile.role]?.has(permission)) {
      return <Navigate to="/" replace />
    }
  }

  // Legacy: role-based check
  if (roles && !roles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }

  return children
}
