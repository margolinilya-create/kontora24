import { create } from 'zustand'
import { supabase } from '@/shared/lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: profile } = await supabase
          .from('k24_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        set({ user: session.user, profile, loading: false })
      } else {
        set({ user: null, profile: null, loading: false })
      }
    } catch {
      set({ user: null, profile: null, loading: false })
    }

    // Unsubscribe existing listener if initialize() is called again
    const existing = get()._authSubscription
    if (existing) existing.unsubscribe()

    // Listen for auth changes (store subscription for cleanup)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('k24_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        set({ user: session.user, profile })
      } else {
        set({ user: null, profile: null })
      }
    })
    set({ _authSubscription: subscription })

    // If "remember me" was unchecked, clear session on next load
    const rememberMe = localStorage.getItem('rememberMe')
    if (rememberMe === 'false') {
      localStorage.removeItem('rememberMe')
      supabase.auth.signOut()
    }
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error

    // Verify this user has a Kontora24 profile
    const { data: profile } = await supabase
      .from('k24_profiles')
      .select('id')
      .eq('id', data.user.id)
      .single()

    if (!profile) {
      await supabase.auth.signOut()
      throw new Error('Нет доступа к Kontora24')
    }

    return data
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },

  hasRole: (roles) => {
    const { profile } = get()
    if (!profile) return false
    if (Array.isArray(roles)) return roles.includes(profile.role)
    return profile.role === roles
  },
}))
