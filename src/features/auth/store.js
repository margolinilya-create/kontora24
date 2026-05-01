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
          .from('profiles')
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

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        set({ user: session.user, profile })
      } else {
        set({ user: null, profile: null })
      }
    })

    // If "remember me" was unchecked, sign out when the browser/tab closes
    const rememberMe = localStorage.getItem('rememberMe')
    if (rememberMe === 'false') {
      window.addEventListener('beforeunload', () => {
        supabase.auth.signOut()
        localStorage.removeItem('rememberMe')
      })
    }
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
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
