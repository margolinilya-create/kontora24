import { useAuthStore } from '@/features/auth/store'
import { useRoleSwitcherStore } from '@/shared/stores/role-switcher-store'
import { ROLES } from '@/shared/constants'

export function RoleEmulationBanner() {
  const realProfile = useAuthStore((s) => s.profile)
  const { impersonatedProfile, resetImpersonation } = useRoleSwitcherStore()

  if (realProfile?.role !== 'admin' || !impersonatedProfile) return null

  const name = impersonatedProfile.display_name || 'Без имени'
  const roleLabel = ROLES[impersonatedProfile.role]?.label || impersonatedProfile.role

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-amber-600 text-white px-4 py-2.5 rounded-xl shadow-lg max-w-[calc(100vw-2rem)]">
      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
      <span className="text-sm font-medium truncate">
        {name} · {roleLabel}
      </span>
      <button
        onClick={resetImpersonation}
        className="ml-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors min-h-[36px] flex-shrink-0"
      >
        Вернуться
      </button>
    </div>
  )
}
