import { useState, useEffect } from 'react'
import { useRoleSwitcherStore } from '@/shared/stores/role-switcher-store'
import { useAuthStore } from '@/features/auth/store'
import { supabase } from '@/shared/lib/supabase'
import { captureError } from '@/shared/lib/sentry'
import { ROLES } from '@/shared/constants'
import { cn } from '@/shared/lib/utils'

const ROLE_ORDER = ['admin', 'manager', 'designer', 'printer', 'post_printer']

export function RoleSwitcher({ collapsed }) {
  const realProfile = useAuthStore((s) => s.profile)
  const { impersonatedProfile, setImpersonatedProfile, resetImpersonation } = useRoleSwitcherStore()
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Lazy-fetch the user list once when the dropdown is first opened
  useEffect(() => {
    if (!open || users.length > 0) return
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .from('k24_profiles')
      .select('id, display_name, role')
      .order('display_name', { ascending: true })
      .then(({ data, error: dbError }) => {
        if (cancelled) return
        if (dbError) {
          setError(dbError)
          captureError(dbError, { tags: { source: 'RoleSwitcher.fetchUsers' } })
        } else {
          setUsers(data || [])
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, users.length])

  if (realProfile?.role !== 'admin') return null

  const isImpersonating = impersonatedProfile !== null
  const currentLabel = isImpersonating
    ? `${impersonatedProfile.display_name || 'Без имени'} · ${ROLES[impersonatedProfile.role]?.label || impersonatedProfile.role}`
    : 'Администратор'

  const grouped = ROLE_ORDER
    .map((role) => ({
      role,
      label: ROLES[role]?.label || role,
      users: users.filter((u) => u.role === role && u.id !== realProfile.id),
    }))
    .filter((g) => g.users.length > 0)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors min-h-[44px]',
          isImpersonating
            ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
            : 'text-white/75 hover:bg-white/10 hover:text-white'
        )}
        aria-label="Войти как пользователь"
        title={collapsed ? (isImpersonating ? currentLabel : 'Войти как пользователь') : undefined}
      >
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        {!collapsed && (
          <span className="truncate">
            {isImpersonating ? currentLabel : 'Войти как пользователь'}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div className={cn(
            'absolute z-50 bg-surface border border-border rounded-xl shadow-xl py-2 w-64 max-h-[60vh] overflow-y-auto',
            collapsed ? 'left-full ml-2 bottom-0' : 'bottom-full mb-2 left-0'
          )}>
            <p className="px-3 py-1.5 text-xs font-semibold text-text-muted uppercase">
              Войти как пользователь
            </p>

            {isImpersonating && (
              <button
                onClick={() => { resetImpersonation(); setOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-surface-dim transition-colors text-accent font-medium border-b border-border"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                Вернуться к Администратор
              </button>
            )}

            {loading && (
              <p className="px-3 py-3 text-sm text-text-muted">Загрузка пользователей…</p>
            )}
            {error && (
              <p className="px-3 py-3 text-sm text-red-500">Не удалось загрузить пользователей</p>
            )}
            {!loading && !error && grouped.length === 0 && (
              <p className="px-3 py-3 text-sm text-text-muted">Других пользователей нет</p>
            )}

            {grouped.map((group) => (
              <div key={group.role}>
                <p className="px-3 pt-3 pb-1 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                  {group.label}
                </p>
                {group.users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setImpersonatedProfile(u); setOpen(false) }}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors',
                      impersonatedProfile?.id === u.id
                        ? 'bg-accent/10 text-accent font-medium'
                        : 'text-text hover:bg-surface-dim'
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', ROLES[u.role]?.color?.split(' ')[0])} />
                    <span className="truncate">{u.display_name || '(без имени)'}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
