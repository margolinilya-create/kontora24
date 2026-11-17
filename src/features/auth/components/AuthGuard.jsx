import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRolePermissionsStore } from '../role-permissions-store'
import Spinner from '@/shared/components/Spinner'

function PermissionsLoadError({ onRetry, retrying }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      <h2 className="text-xl font-semibold mb-2">Не удалось загрузить права доступа</h2>
      <p className="text-text-muted text-sm mb-4 max-w-md">
        Проверьте подключение к интернету и попробуйте ещё раз. Если ошибка повторяется — напишите администратору.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex items-center justify-center min-h-[44px] bg-accent hover:bg-accent-hover text-on-accent font-medium rounded-lg px-5 py-2.5 text-sm transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        {retrying ? 'Загрузка…' : 'Повторить'}
      </button>
    </div>
  )
}

/**
 * @param {Object} props
 * @param {string[]} [props.roles] — legacy: разрешённые роли
 * @param {string} [props.permission] — L2: проверка через k24_role_permissions
 */
export function AuthGuard({ children, roles, permission }) {
  const { user, profile, loading, realRole } = useAuth()
  const location = useLocation()
  const permsLoaded = useRolePermissionsStore((s) => s.loaded)
  const permissions = useRolePermissionsStore((s) => s.permissions)
  const permsError = useRolePermissionsStore((s) => s.error)
  const permsLoading = useRolePermissionsStore((s) => s.loading)
  const loadPerms = useRolePermissionsStore((s) => s.load)

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
      // Права не загрузились даже после повторов. Владелец (admin) не должен
      // блокироваться — пропускаем его, остальным показываем экран с «Повторить».
      if (permsError && !permsLoading) {
        if (realRole === 'admin') return children
        return <PermissionsLoadError onRetry={() => loadPerms()} retrying={permsLoading} />
      }
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
