import { useState } from 'react'
import { useRoleSwitcherStore } from '@/shared/stores/role-switcher-store'
import { useAuthStore } from '@/features/auth/store'
import { ROLES } from '@/shared/constants'
import { cn } from '@/shared/lib/utils'

export function RoleSwitcher({ collapsed }) {
  const realProfile = useAuthStore((s) => s.profile)
  const { emulatedRole, setEmulatedRole, resetRole } = useRoleSwitcherStore()
  const [open, setOpen] = useState(false)

  // Only admin can switch roles
  if (realProfile?.role !== 'admin') return null

  const isEmulating = emulatedRole !== null
  const currentLabel = isEmulating ? ROLES[emulatedRole]?.label : 'Администратор'

  const roles = Object.entries(ROLES).filter(([key]) => key !== 'admin')

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors min-h-[44px]',
          isEmulating
            ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
            : 'text-white/75 hover:bg-white/10 hover:text-white'
        )}
        aria-label="Переключение роли"
        title={collapsed ? 'Переключить роль' : undefined}
      >
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        {!collapsed && (
          <span className="truncate">
            {isEmulating ? currentLabel : 'Сменить роль'}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div className={cn(
            'absolute z-50 bg-surface border border-border rounded-xl shadow-xl py-2 min-w-[200px]',
            collapsed ? 'left-full ml-2 bottom-0' : 'bottom-full mb-2 left-0 right-0'
          )}>
            <p className="px-3 py-1.5 text-xs font-semibold text-text-muted uppercase">
              Эмуляция роли
            </p>

            {isEmulating && (
              <button
                onClick={() => { resetRole(); setOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-surface-dim transition-colors text-accent font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                Вернуться к Администратор
              </button>
            )}

            {roles.map(([key, role]) => (
              <button
                key={key}
                onClick={() => { setEmulatedRole(key); setOpen(false) }}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors',
                  emulatedRole === key
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-text hover:bg-surface-dim'
                )}
              >
                <span className={cn('w-2 h-2 rounded-full', role.color.split(' ')[0])} />
                {role.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
