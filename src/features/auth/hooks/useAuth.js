import { useMemo } from 'react'
import { useAuthStore } from '../store'
import { useRoleSwitcherStore } from '@/shared/stores/role-switcher-store'

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const loading = useAuthStore((s) => s.loading)
  const signIn = useAuthStore((s) => s.signIn)
  const signOut = useAuthStore((s) => s.signOut)
  const emulatedRole = useRoleSwitcherStore((s) => s.emulatedRole)

  const realRole = profile?.role
  const isEmulating = realRole === 'admin' && emulatedRole !== null

  // Effective profile — with emulated role if active
  const effectiveProfile = useMemo(() => {
    if (!profile) return null
    if (isEmulating) {
      return { ...profile, role: emulatedRole }
    }
    return profile
  }, [profile, isEmulating, emulatedRole])

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
    isEmulating,
    realRole,
  }
}
