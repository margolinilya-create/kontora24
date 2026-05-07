import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  }
  return { mockSupabase }
})

vi.mock('@/shared/lib/supabase', () => ({ supabase: mockSupabase }))

import { useAuthStore } from './store'

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useAuthStore.setState({ user: null, profile: null, loading: true, _authSubscription: null })
  })

  describe('initialize', () => {
    it('sets user and profile when session exists', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com' }
      const mockProfileData = { id: 'user-1', role: 'admin', display_name: 'Admin' }

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } }, error: null,
      })
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockProfileData }),
      })

      await useAuthStore.getState().initialize()

      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.profile).toEqual(mockProfileData)
      expect(state.loading).toBe(false)
    })

    it('sets null when no session', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null }, error: null,
      })

      await useAuthStore.getState().initialize()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.profile).toBeNull()
      expect(state.loading).toBe(false)
    })

    it('handles error gracefully (sets null)', async () => {
      mockSupabase.auth.getSession.mockRejectedValue(new Error('Network error'))

      await useAuthStore.getState().initialize()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.profile).toBeNull()
      expect(state.loading).toBe(false)
    })

    it('registers onAuthStateChange listener', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

      await useAuthStore.getState().initialize()

      expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled()
    })

    it('signs out when rememberMe=false in localStorage', async () => {
      localStorage.setItem('rememberMe', 'false')
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

      await useAuthStore.getState().initialize()

      expect(mockSupabase.auth.signOut).toHaveBeenCalled()
      expect(localStorage.getItem('rememberMe')).toBeNull()
    })

    it('signs out and clears state when profile fetch fails (avoids infinite spinner)', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } }, error: null,
      })
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      })

      await useAuthStore.getState().initialize()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.profile).toBeNull()
      expect(state.loading).toBe(false)
      expect(mockSupabase.auth.signOut).toHaveBeenCalled()
    })

    it('signs out when profile is missing (no Kontora24 access)', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } }, error: null,
      })
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      await useAuthStore.getState().initialize()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.profile).toBeNull()
      expect(mockSupabase.auth.signOut).toHaveBeenCalled()
    })
  })

  describe('signIn', () => {
    it('succeeds when profile exists', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com' }
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser }, error: null,
      })
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'user-1' } }),
      })

      const result = await useAuthStore.getState().signIn('test@test.com', 'password')
      expect(result.user).toEqual(mockUser)
    })

    it('throws when profile not found (access denied)', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user-1' } }, error: null,
      })
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
      })

      await expect(useAuthStore.getState().signIn('test@test.com', 'password'))
        .rejects.toThrow('Нет доступа к Kontora24')
      expect(mockSupabase.auth.signOut).toHaveBeenCalled()
    })

    it('throws on auth error', async () => {
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: null }, error: new Error('Invalid credentials'),
      })

      await expect(useAuthStore.getState().signIn('test@test.com', 'wrong'))
        .rejects.toThrow('Invalid credentials')
    })
  })

  describe('signOut', () => {
    it('clears user and profile', async () => {
      useAuthStore.setState({ user: { id: 'user-1' }, profile: { role: 'admin' } })

      await useAuthStore.getState().signOut()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.profile).toBeNull()
    })

    it('calls supabase.auth.signOut', async () => {
      await useAuthStore.getState().signOut()
      expect(mockSupabase.auth.signOut).toHaveBeenCalled()
    })
  })

  describe('hasRole', () => {
    it('returns true when profile role matches string', () => {
      useAuthStore.setState({ profile: { role: 'admin' } })
      expect(useAuthStore.getState().hasRole('admin')).toBe(true)
    })

    it('returns false when profile role does not match', () => {
      useAuthStore.setState({ profile: { role: 'printer' } })
      expect(useAuthStore.getState().hasRole('admin')).toBe(false)
    })

    it('returns true when profile role is in array', () => {
      useAuthStore.setState({ profile: { role: 'manager' } })
      expect(useAuthStore.getState().hasRole(['admin', 'manager'])).toBe(true)
    })

    it('returns false when profile role is not in array', () => {
      useAuthStore.setState({ profile: { role: 'designer' } })
      expect(useAuthStore.getState().hasRole(['admin', 'manager'])).toBe(false)
    })

    it('returns false when profile is null', () => {
      useAuthStore.setState({ profile: null })
      expect(useAuthStore.getState().hasRole('admin')).toBe(false)
    })
  })
})
