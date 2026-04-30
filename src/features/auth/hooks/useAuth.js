import { useAuthStore } from '../store'

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const loading = useAuthStore((s) => s.loading)
  const signIn = useAuthStore((s) => s.signIn)
  const signOut = useAuthStore((s) => s.signOut)
  const hasRole = useAuthStore((s) => s.hasRole)

  return { user, profile, loading, signIn, signOut, hasRole }
}
