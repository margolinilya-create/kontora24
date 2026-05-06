import { useMemo } from 'react'
import { useAuthStore } from '../store'
import { useRoleSwitcherStore } from '@/shared/stores/role-switcher-store'

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const loading = useAuthStore((s) => s.loading)
  const signIn = useAuthStore((s) => s.signIn)
  const signOut = useAuthStore((s) => s.signOut)
  const impersonatedProfile = useRoleSwitcherStore((s) => s.impersonatedProfile)

  const realRole = profile?.role
  const isImpersonating = realRole === 'admin' && impersonatedProfile !== null

  // Effective profile — full impersonated profile if active, else real
  const effectiveProfile = useMemo(() => {
    if (!profile) return null
    if (isImpersonating) return impersonatedProfile
    return profile
  }, [profile, isImpersonating, impersonatedProfile])

  const hasRole = (roles) => {
    if (!effectiveProfile) return false
    if (Array.isArray(roles)) return roles.includes(effectiveProfile.role)
    return effectiveProfile.role === roles
  }

  return {
    user,
    profile: effectiveProfile,
    realProfile: profile,
    loading,
    signIn,
    signOut,
    hasRole,
    isImpersonating,
    realRole,
  }
}
